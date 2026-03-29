import asyncio
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from db.database import get_db
from db.models import Project, ProjectAgent, Agent, ApprovalGate, utcnow
from services.project_factory import create_project
from services.goose_manager import goose_manager
from contracts.state import read_state, update_phase

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str
    brief: str
    targetDir: str
    config: dict = {}
    stages: Optional[list[str]] = None


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [{
        "id": p.id, "name": p.name, "brief": p.brief[:200],
        "targetDir": p.target_dir, "status": p.status,
        "complexity": p.complexity, "createdAt": p.created_at,
    } for p in projects]


@router.post("")
async def create_project_route(req: CreateProjectRequest, db: Session = Depends(get_db)):
    try:
        result = await create_project(db, req.name, req.brief, req.targetDir, req.config, req.stages)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    pa_rows = db.query(ProjectAgent, Agent).join(Agent, ProjectAgent.agent_id == Agent.id).filter(
        ProjectAgent.project_id == project_id
    ).all()
    agents = [{"id": a.id, "name": a.name, "role": pa.role, "status": a.status} for pa, a in pa_rows]

    gates = db.query(ApprovalGate).filter(ApprovalGate.project_id == project_id).all()
    approval_gates = [{
        "id": g.id, "type": g.type, "status": g.status,
        "payload": json.loads(g.payload), "feedback": g.feedback,
    } for g in gates]

    state = read_state(project.target_dir)

    return {
        "id": project.id, "name": project.name, "brief": project.brief,
        "targetDir": project.target_dir, "status": project.status,
        "complexity": project.complexity,
        "config": json.loads(project.config) if project.config else {},
        "planApproved": project.plan_approved,
        "agents": agents, "approvalGates": approval_gates,
        "state": state,
        "createdAt": project.created_at, "updatedAt": project.updated_at,
    }


@router.post("/{project_id}/approve")
async def approve_plan(project_id: str, db: Session = Depends(get_db)):
    """Approve the plan and advance the pipeline past approval phase."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    state = read_state(project.target_dir)
    if not state:
        raise HTTPException(status_code=400, detail="No state found")

    approval_phase = state.get("pipeline", {}).get("phases", {}).get("approval", {})
    if approval_phase.get("status") != "pending":
        raise HTTPException(status_code=400, detail="No pending approval")

    update_phase(project.target_dir, "approval", {"status": "completed"})

    project.plan_approved = True
    project.status = "approved"
    project.updated_at = utcnow()
    db.commit()

    # Resolve any matching DB approval gates too
    gates = db.query(ApprovalGate).filter(
        ApprovalGate.project_id == project_id,
        ApprovalGate.status == "pending",
    ).all()
    for g in gates:
        g.status = "approved"
        g.resolved_at = utcnow()
    db.commit()

    # Resume the pipeline from the approved state
    from services.project_factory import resume_after_approval
    asyncio.create_task(resume_after_approval(project_id, project.target_dir, project.complexity))

    return {"status": "approved"}


@router.post("/{project_id}/resume")
async def resume_project(project_id: str, db: Session = Depends(get_db)):
    """Resume a failed or stopped project from its current phase."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    state = read_state(project.target_dir)
    if not state:
        raise HTTPException(status_code=400, detail="No state found")

    current_phase = state.get("pipeline", {}).get("current_phase", "")

    if current_phase == "approval":
        # Need approval first
        raise HTTPException(status_code=400, detail="Approve plan first")

    from services.project_factory import resume_after_approval
    project.status = f"resuming:{current_phase}"
    project.updated_at = utcnow()
    db.commit()

    asyncio.create_task(resume_after_approval(project_id, project.target_dir, project.complexity))

    return {"status": "resuming"}


@router.post("/{project_id}/stop")
def stop_project(project_id: str, db: Session = Depends(get_db)):
    """Stop all running Goose agents for this project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Kill all Goose processes for agents in this project
    pa_rows = db.query(ProjectAgent, Agent).join(Agent, ProjectAgent.agent_id == Agent.id).filter(
        ProjectAgent.project_id == project_id
    ).all()

    killed = 0
    for pa, agent in pa_rows:
        if goose_manager.kill_agent(agent.id):
            killed += 1
        agent.status = "idle"

    # Also kill agents by role-prefix pattern (factory pipeline agents)
    prefix = project_id[:8]
    for role in ["planner", "coder", "reviewer", "researcher", "deployer"]:
        if goose_manager.kill_agent(f"{role}-{prefix}"):
            killed += 1

    project.status = "failed"
    project.updated_at = utcnow()
    db.commit()

    return {"stopped": True, "killed": killed}


@router.put("/{project_id}")
def update_project(project_id: str, updates: dict, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in updates.items():
        if hasattr(project, key):
            setattr(project, key, value)
    project.updated_at = utcnow()
    db.commit()
    return {"updated": True}
