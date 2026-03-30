import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from db.database import get_db
from db.models import Event

router = APIRouter(prefix="/api/events-log", tags=["events"])


@router.get("")
def list_events(
    projectId: Optional[str] = None,
    agentId: Optional[str] = None,
    type: Optional[str] = None,
    channel: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(Event)
    if projectId:
        query = query.filter(Event.project_id == projectId)
    if agentId:
        query = query.filter(Event.agent_id == agentId)
    if type:
        query = query.filter(Event.type == type)
    if channel:
        query = query.filter(Event.channel == channel)
    events = query.order_by(Event.timestamp.desc()).limit(limit).all()
    return [{
        "id": e.id,
        "type": e.type,
        "agentId": e.agent_id,
        "projectId": e.project_id,
        "channel": e.channel,
        "direction": e.direction,
        "status": e.status,
        "content": e.content,
        "toolName": e.tool_name,
        "toolType": e.tool_type,
        "workflowId": e.workflow_id,
        "executionId": e.execution_id,
        "metadata": json.loads(e.meta),
        "timestamp": e.timestamp,
    } for e in reversed(events)]
