"""Factory endpoint — run pre-configured SDLC pipelines through the workflow engine."""
import json
import asyncio
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db.database import get_db, SessionLocal
from db.models import Workflow, WorkflowExecution, Agent, AgentTemplate, new_id, utcnow
from services.event_bus import event_bus

router = APIRouter(prefix="/api/factory", tags=["factory"])


# Pre-defined pipeline topologies by complexity
SIMPLE_NODES = [
    {"id": "node-planner", "label": "Planner", "role": "planner"},
    {"id": "node-coder", "label": "Coder", "role": "coder"},
    {"id": "node-reviewer", "label": "Reviewer", "role": "reviewer"},
]
SIMPLE_EDGES = [
    {"id": "e1", "source": "node-planner", "target": "node-coder", "data": {"condition": "always"}},
    {"id": "e2", "source": "node-coder", "target": "node-reviewer", "data": {"condition": "always"}},
    {"id": "e3", "source": "node-reviewer", "target": "node-coder", "data": {"condition": "reject"}},
]

MEDIUM_NODES = [
    {"id": "node-researcher", "label": "Researcher", "role": "researcher"},
    {"id": "node-planner", "label": "Planner", "role": "planner"},
    {"id": "node-coder", "label": "Coder", "role": "coder"},
    {"id": "node-reviewer", "label": "Reviewer", "role": "reviewer"},
    {"id": "node-qa", "label": "QA", "role": "qa"},
]
MEDIUM_EDGES = [
    {"id": "e1", "source": "node-researcher", "target": "node-planner", "data": {"condition": "always"}},
    {"id": "e2", "source": "node-planner", "target": "node-coder", "data": {"condition": "always"}},
    {"id": "e3", "source": "node-coder", "target": "node-reviewer", "data": {"condition": "always"}},
    {"id": "e4", "source": "node-reviewer", "target": "node-qa", "data": {"condition": "approve"}},
    {"id": "e5", "source": "node-reviewer", "target": "node-coder", "data": {"condition": "reject"}},
]


def _find_agent_for_role(db: Session, role: str) -> Optional[str]:
    """Find a standalone agent matching this role, or create one from template."""
    # Map factory roles to DB roles
    role_map = {"coder": ["coder", "developer"], "reviewer": ["reviewer", "code-reviewer"]}
    search_roles = role_map.get(role, [role])

    for r in search_roles:
        agent = db.query(Agent).filter(Agent.role == r).first()
        if agent:
            return agent.id

    # No agent found — create from template
    for r in search_roles:
        template = db.query(AgentTemplate).filter(AgentTemplate.role == r).first()
        if template:
            now = utcnow()
            agent = Agent(
                id=new_id(), name=template.name, role=template.role,
                system_prompt=template.system_prompt,
                model=template.model, provider=template.provider,
                tools=template.tools, skills=template.skills,
                extensions=template.extensions or "[]",
                created_at=now, updated_at=now,
            )
            db.add(agent)
            db.commit()
            return agent.id

    return None


def _build_workflow_nodes(db: Session, node_defs: list[dict]) -> list[dict]:
    """Convert factory node definitions to React Flow format with assigned agents."""
    nodes = []
    x = 0
    for nd in node_defs:
        agent_id = _find_agent_for_role(db, nd["role"])
        if not agent_id:
            raise HTTPException(status_code=500, detail=f"No agent found for role '{nd['role']}'")
        nodes.append({
            "id": nd["id"],
            "type": "agentNode",
            "position": {"x": x, "y": 100},
            "data": {"agentId": agent_id, "label": nd["label"], "status": "idle"},
        })
        x += 250
    return nodes


def _build_workflow_edges(edge_defs: list[dict]) -> list[dict]:
    """Convert factory edge definitions to React Flow format."""
    return [{
        "id": e["id"], "source": e["source"], "target": e["target"],
        "type": "conditionEdge", "animated": True, "data": e.get("data", {"condition": "always"}),
    } for e in edge_defs]


class FactoryRunRequest(BaseModel):
    task: str
    target_dir: str
    complexity: str = "simple"  # simple | medium | complex


@router.post("/run")
async def run_factory(req: FactoryRunRequest, db: Session = Depends(get_db)):
    if req.complexity not in ("simple", "medium", "complex"):
        raise HTTPException(status_code=400, detail="complexity must be simple, medium, or complex")

    # Create target directory
    os.makedirs(req.target_dir, exist_ok=True)

    # Pick topology
    if req.complexity == "simple":
        node_defs, edge_defs = SIMPLE_NODES, SIMPLE_EDGES
    else:
        node_defs, edge_defs = MEDIUM_NODES, MEDIUM_EDGES

    # Build workflow nodes with real agent IDs
    nodes = _build_workflow_nodes(db, node_defs)
    edges = _build_workflow_edges(edge_defs)

    # Create a workflow record for tracking
    now = utcnow()
    workflow = Workflow(
        id=new_id(),
        name=f"Factory: {req.task[:50]}",
        description=f"Auto-generated {req.complexity} pipeline",
        nodes=json.dumps(nodes), edges=json.dumps(edges),
        status="active", created_at=now, updated_at=now,
    )
    db.add(workflow)
    db.commit()

    # Create execution
    execution_id = new_id()
    execution = WorkflowExecution(
        id=execution_id, workflow_id=workflow.id,
        status="running", context=json.dumps({}),
        started_at=now,
    )
    db.add(execution)
    workflow.last_execution_id = execution_id
    db.commit()

    await event_bus.emit("workflow:started", {
        "workflow_id": workflow.id, "execution_id": execution_id,
    })

    # Import and run through the same sandbox engine as workflows
    from routes.workflows import _run_workflow
    asyncio.create_task(_run_workflow(
        execution_id, workflow.id, nodes, edges,
        cwd=req.target_dir, task_input=req.task,
    ))

    return {
        "workflowId": workflow.id,
        "executionId": execution_id,
        "status": "running",
        "complexity": req.complexity,
        "nodes": len(nodes),
    }


@router.get("/templates")
def list_factory_templates():
    """Return the available factory pipeline configurations."""
    return [
        {
            "complexity": "simple",
            "name": "Simple Pipeline",
            "description": "Planner → Coder → Reviewer (with feedback loop)",
            "nodes": [n["label"] for n in SIMPLE_NODES],
        },
        {
            "complexity": "medium",
            "name": "Full Pipeline",
            "description": "Researcher → Planner → Coder → Reviewer → QA",
            "nodes": [n["label"] for n in MEDIUM_NODES],
        },
        {
            "complexity": "complex",
            "name": "Full Pipeline (Extended)",
            "description": "Same as medium with deeper analysis and more retry cycles",
            "nodes": [n["label"] for n in MEDIUM_NODES],
        },
    ]
