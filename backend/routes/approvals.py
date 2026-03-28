from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db.database import get_db
from db.models import ApprovalGate, Project, utcnow
from services.event_bus import event_bus

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


class ApprovalAction(BaseModel):
    action: str
    feedback: Optional[str] = None


@router.post("/{gate_id}")
async def resolve_approval(gate_id: str, req: ApprovalAction, db: Session = Depends(get_db)):
    gate = db.query(ApprovalGate).filter(ApprovalGate.id == gate_id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Approval gate not found")

    gate.status = "approved" if req.action == "approve" else "rejected"
    gate.feedback = req.feedback
    gate.resolved_at = utcnow()
    db.commit()

    project = db.query(Project).filter(Project.id == gate.project_id).first()
    if project:
        project.status = "building" if req.action == "approve" else "planning"
        project.plan_approved = req.action == "approve"
        project.updated_at = utcnow()
        db.commit()

    await event_bus.emit("approval:resolved", {
        "gate_id": gate_id,
        "project_id": gate.project_id,
        "action": req.action,
        "feedback": req.feedback,
    })

    return {"status": gate.status}
