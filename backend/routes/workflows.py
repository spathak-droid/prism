import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db.database import get_db, SessionLocal
from db.models import Workflow, WorkflowExecution, new_id, utcnow
from graphs.sandbox import build_sandbox_graph, SandboxState
from services.event_bus import event_bus

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class CreateWorkflowRequest(BaseModel):
    name: str
    description: str = ""
    nodes: list[dict] = []
    edges: list[dict] = []


class UpdateWorkflowRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    nodes: Optional[list[dict]] = None
    edges: Optional[list[dict]] = None
    status: Optional[str] = None


@router.get("")
def list_workflows(db: Session = Depends(get_db)):
    workflows = db.query(Workflow).order_by(Workflow.created_at.desc()).all()
    return [{
        "id": w.id, "name": w.name, "description": w.description,
        "nodes": json.loads(w.nodes), "edges": json.loads(w.edges),
        "isTemplate": w.is_template, "status": w.status,
        "createdAt": w.created_at, "updatedAt": w.updated_at,
    } for w in workflows]


@router.post("")
def create_workflow(req: CreateWorkflowRequest, db: Session = Depends(get_db)):
    now = utcnow()
    workflow = Workflow(
        id=new_id(), name=req.name, description=req.description,
        nodes=json.dumps(req.nodes), edges=json.dumps(req.edges),
        status="draft", created_at=now, updated_at=now,
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return {
        "id": workflow.id, "name": workflow.name,
        "nodes": json.loads(workflow.nodes), "edges": json.loads(workflow.edges),
    }


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    w = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")
    executions = db.query(WorkflowExecution).filter(
        WorkflowExecution.workflow_id == workflow_id
    ).order_by(WorkflowExecution.started_at.desc()).limit(10).all()
    return {
        "id": w.id, "name": w.name, "description": w.description,
        "nodes": json.loads(w.nodes), "edges": json.loads(w.edges),
        "isTemplate": w.is_template, "status": w.status,
        "executions": [{
            "id": e.id, "status": e.status,
            "startedAt": e.started_at, "completedAt": e.completed_at,
        } for e in executions],
        "createdAt": w.created_at, "updatedAt": w.updated_at,
    }


@router.put("/{workflow_id}")
def update_workflow(workflow_id: str, req: UpdateWorkflowRequest, db: Session = Depends(get_db)):
    w = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if req.name is not None: w.name = req.name
    if req.description is not None: w.description = req.description
    if req.nodes is not None: w.nodes = json.dumps(req.nodes)
    if req.edges is not None: w.edges = json.dumps(req.edges)
    if req.status is not None: w.status = req.status
    w.updated_at = utcnow()
    db.commit()
    return {"updated": True}


@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    w = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db.delete(w)
    db.commit()
    return {"deleted": True}


@router.post("/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, db: Session = Depends(get_db)):
    w = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")

    nodes = json.loads(w.nodes)
    edges = json.loads(w.edges)

    execution_id = new_id()
    now = utcnow()
    execution = WorkflowExecution(
        id=execution_id, workflow_id=workflow_id,
        status="running", context=json.dumps({}),
        started_at=now,
    )
    db.add(execution)
    db.commit()

    await event_bus.emit("workflow:started", {
        "workflow_id": workflow_id, "execution_id": execution_id,
    })

    # Run in background
    asyncio.create_task(_run_workflow(execution_id, workflow_id, nodes, edges))

    return {"executionId": execution_id, "status": "running"}


@router.post("/{workflow_id}/stop")
def stop_workflow(workflow_id: str, db: Session = Depends(get_db)):
    executions = db.query(WorkflowExecution).filter(
        WorkflowExecution.workflow_id == workflow_id,
        WorkflowExecution.status == "running",
    ).all()
    for e in executions:
        e.status = "stopped"
        e.completed_at = utcnow()
    db.commit()
    return {"stopped": len(executions)}


async def _run_workflow(execution_id: str, workflow_id: str, nodes: list, edges: list):
    """Run a sandbox workflow via LangGraph."""
    db = SessionLocal()
    try:
        graph = build_sandbox_graph(nodes, edges)
        if not graph:
            return

        compiled = graph.compile()

        initial_state: SandboxState = {
            "workflow_id": workflow_id,
            "execution_id": execution_id,
            "node_results": {},
            "current_node": None,
            "status": "running",
            "error": None,
        }

        result = await compiled.ainvoke(initial_state)

        execution = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
        if execution:
            execution.status = "completed"
            execution.context = json.dumps(result.get("node_results", {}))
            execution.completed_at = utcnow()
            db.commit()

        await event_bus.emit("workflow:completed", {
            "workflow_id": workflow_id, "execution_id": execution_id,
        })

    except Exception as e:
        execution = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
        if execution:
            execution.status = "failed"
            execution.completed_at = utcnow()
            db.commit()

        await event_bus.emit("workflow:failed", {
            "workflow_id": workflow_id, "execution_id": execution_id, "error": str(e),
        })
    finally:
        db.close()
