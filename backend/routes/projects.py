import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from db.database import get_db
from db.models import Project, ProjectAgent, Agent, ApprovalGate, utcnow
from services.project_factory import create_project
from contracts.state import read_state

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str
    brief: str
    targetDir: str
    config: dict = {}


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
    result = await create_project(db, req.name, req.brief, req.targetDir, req.config)
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
        "config": json.loads(project.config),
        "planApproved": project.plan_approved,
        "agents": agents, "approvalGates": approval_gates,
        "state": state,
        "createdAt": project.created_at, "updatedAt": project.updated_at,
    }


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
