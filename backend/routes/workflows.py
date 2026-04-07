import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db.database import get_db, SessionLocal
from db.models import Workflow, WorkflowExecution, Event, new_id, utcnow
from graphs.sandbox import build_sandbox_graph, SandboxState
from services.event_bus import event_bus
from services.goose_manager import goose_manager
from services.checkpointer import get_checkpointer

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
    result = []
    for w in workflows:
        # Find the latest execution for this workflow
        last_exec = db.query(WorkflowExecution).filter(
            WorkflowExecution.workflow_id == w.id
        ).order_by(WorkflowExecution.started_at.desc()).first()

        result.append({
            "id": w.id, "name": w.name, "description": w.description,
            "nodes": json.loads(w.nodes), "edges": json.loads(w.edges),
            "isTemplate": w.is_template, "status": w.status,
            "createdAt": w.created_at, "updatedAt": w.updated_at,
            "lastExecutionId": last_exec.id if last_exec else None,
            "lastExecutionStatus": last_exec.status if last_exec else None,
        })
    return result


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
        "id": workflow.id, "name": workflow.name, "description": workflow.description,
        "nodes": json.loads(workflow.nodes), "edges": json.loads(workflow.edges),
        "isTemplate": workflow.is_template, "status": workflow.status,
        "createdAt": workflow.created_at, "updatedAt": workflow.updated_at,
    }


@router.get("/executions/{execution_id}")
def get_execution(execution_id: str, db: Session = Depends(get_db)):
    e = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Execution not found")
    return {
        "id": e.id,
        "workflowId": e.workflow_id,
        "projectId": e.project_id,
        "status": e.status,
        "context": json.loads(e.context),
        "startedAt": e.started_at,
        "completedAt": e.completed_at,
    }


@router.get("/executions/{execution_id}/events")
def get_execution_events(execution_id: str, db: Session = Depends(get_db)):
    """Return persisted events for a workflow execution (for log replay)."""
    events = db.query(Event).filter(
        Event.execution_id == execution_id
    ).order_by(Event.timestamp.asc()).limit(500).all()
    return [{
        "type": ev.type,
        "agent_id": ev.agent_id,
        "status": ev.status,
        "content": ev.content,
        "tool_name": ev.tool_name,
        "tool_type": ev.tool_type,
        "timestamp": ev.timestamp,
        "meta": json.loads(ev.meta) if ev.meta else {},
    } for ev in events]


@router.post("/executions/{execution_id}/stop")
def stop_execution(execution_id: str, db: Session = Depends(get_db)):
    e = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Execution not found")

    # Kill all goose processes for agents involved
    goose_manager.kill_all()

    e.status = "stopped"
    e.completed_at = utcnow()
    db.commit()
    return {"status": "stopped"}


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
        "lastExecutionId": w.last_execution_id,
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
    db.refresh(w)
    return {
        "id": w.id, "name": w.name, "description": w.description,
        "nodes": json.loads(w.nodes), "edges": json.loads(w.edges),
        "isTemplate": w.is_template, "status": w.status,
        "createdAt": w.created_at, "updatedAt": w.updated_at,
    }


@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    w = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db.delete(w)
    db.commit()
    return {"deleted": True}


class ExecuteWorkflowRequest(BaseModel):
    input: Optional[str] = None
    cwd: Optional[str] = None


@router.post("/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, body: ExecuteWorkflowRequest = ExecuteWorkflowRequest(), db: Session = Depends(get_db)):
    w = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")

    nodes = json.loads(w.nodes)
    edges = json.loads(w.edges)

    # Validate all nodes have agents assigned
    unmapped = [n.get("data", {}).get("label", n["id"]) for n in nodes if not n.get("data", {}).get("agentId")]
    if unmapped:
        raise HTTPException(status_code=400, detail=f"Assign agents to all nodes before executing. Unmapped: {', '.join(unmapped)}")

    execution_id = new_id()
    now = utcnow()
    execution = WorkflowExecution(
        id=execution_id, workflow_id=workflow_id,
        status="running", context=json.dumps({}),
        started_at=now,
    )
    db.add(execution)
    w.last_execution_id = execution_id
    db.commit()

    await event_bus.emit("workflow:started", {
        "workflow_id": workflow_id, "execution_id": execution_id,
    })

    # Run in background
    asyncio.create_task(_run_workflow(execution_id, workflow_id, nodes, edges, cwd=body.cwd, task_input=body.input))

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


async def _run_workflow(execution_id: str, workflow_id: str, nodes: list, edges: list, cwd: str | None = None, task_input: str | None = None):
    """Run a sandbox workflow via LangGraph."""
    import traceback
    db = SessionLocal()
    try:
        graph = build_sandbox_graph(nodes, edges, cwd=cwd)
        if not graph:
            print(f"[workflow:{execution_id}] No graph built (no valid nodes)")
            return

        checkpointer = await get_checkpointer()
        compiled = graph.compile(checkpointer=checkpointer)

        initial_state: SandboxState = {
            "workflow_id": workflow_id,
            "execution_id": execution_id,
            "node_results": {},
            "current_node": None,
            "status": "running",
            "error": None,
            "task_input": task_input or "",
        }

        print(f"[workflow:{execution_id}] Starting execution with {len(nodes)} nodes, cwd={cwd}")
        result = await compiled.ainvoke(
            initial_state,
            config={"configurable": {"thread_id": execution_id}},
        )

        execution = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
        if execution:
            execution.status = "completed"
            execution.context = json.dumps({
                "nodeResults": result.get("node_results", {}),
                "currentNode": None,
                "status": "completed",
            })
            execution.completed_at = utcnow()
            db.commit()

        print(f"[workflow:{execution_id}] Completed successfully")
        await event_bus.emit("workflow:completed", {
            "workflow_id": workflow_id, "execution_id": execution_id,
        })

    except Exception as e:
        print(f"[workflow:{execution_id}] FAILED: {e}")
        traceback.print_exc()
        execution = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
        if execution:
            execution.status = "failed"
            execution.context = json.dumps({
                "nodeResults": {},
                "currentNode": None,
                "status": "failed",
                "error": str(e),
            })
            execution.completed_at = utcnow()
            db.commit()

        await event_bus.emit("workflow:failed", {
            "workflow_id": workflow_id, "execution_id": execution_id, "error": str(e),
        })
    finally:
        db.close()
