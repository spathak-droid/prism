import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db.database import get_db
from db.models import Agent, Message, new_id, utcnow
from services.pipeline import send_through_pipeline
from services.goose_manager import goose_manager
from services.event_bus import event_bus

router = APIRouter(prefix="/api/messages", tags=["messages"])


class SendMessageRequest(BaseModel):
    agentId: str
    content: str
    channel: str = "internal"


@router.get("")
def list_messages(
    agentId: Optional[str] = None,
    projectId: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    query = db.query(Message)
    if agentId:
        query = query.filter(
            (Message.from_agent_id == agentId) | (Message.to_agent_id == agentId)
        )
    if projectId:
        query = query.filter(Message.project_id == projectId)
    messages = query.order_by(Message.timestamp.desc()).limit(limit).all()
    return [{
        "id": m.id,
        "fromAgentId": m.from_agent_id,
        "toAgentId": m.to_agent_id,
        "content": m.content,
        "type": m.type,
        "projectId": m.project_id,
        "channel": m.channel,
        "metadata": json.loads(m.meta),
        "timestamp": m.timestamp,
    } for m in reversed(messages)]


@router.post("/send")
async def send_message(req: SendMessageRequest, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == req.agentId).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if goose_manager.get_status(req.agentId) == "idle":
        goose_manager.register_agent(
            agent.id, agent.name, agent.provider, agent.model,
            json.loads(agent.tools),
        )

    user_msg = Message(
        id=new_id(), from_agent_id=None, to_agent_id=req.agentId,
        content=req.content, type="text", channel=req.channel,
        timestamp=utcnow(),
    )
    db.add(user_msg)
    db.commit()

    await event_bus.emit("agent:message", {
        "agent_id": req.agentId, "direction": "incoming",
        "content": req.content[:200], "channel": req.channel,
    })

    response_text = ""
    agent_dict = {
        "system_prompt": agent.system_prompt,
        "skills": agent.skills,
        "memory": agent.memory,
        "guardrails": agent.guardrails,
    }
    async for chunk in send_through_pipeline(
        agent_id=req.agentId,
        message=req.content,
        db=db,
        agent_data=agent_dict,
    ):
        if chunk.type == "text":
            response_text += chunk.content

    assistant_msg = Message(
        id=new_id(), from_agent_id=req.agentId, to_agent_id=None,
        content=response_text, type="text", channel=req.channel,
        timestamp=utcnow(),
    )
    db.add(assistant_msg)
    db.commit()

    await event_bus.emit("agent:message", {
        "agent_id": req.agentId, "direction": "outgoing",
        "content": response_text[:200], "channel": req.channel,
    })

    return {
        "userMessage": {"id": user_msg.id, "content": user_msg.content},
        "assistantMessage": {"id": assistant_msg.id, "content": assistant_msg.content},
    }
