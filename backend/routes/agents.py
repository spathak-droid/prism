import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db.database import get_db
from db.models import Agent, Message, new_id, utcnow
from services.goose_manager import goose_manager

router = APIRouter(prefix="/api/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    name: str
    role: str = "assistant"
    system_prompt: str = "You are a helpful AI agent."
    model: str = "claude-opus-4-20250514"
    provider: str = "claude-code"
    tools: list[str] = []
    channels: list[str] = []
    schedule: Optional[str] = None
    scheduled_task: Optional[str] = None
    memory: dict = {}
    skills: list[str] = []
    interaction_rules: dict = {"mode": "auto"}
    guardrails: dict = {"cost_limit": 1.0, "rate_limit": 60, "blocked_actions": []}


class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    tools: Optional[list[str]] = None
    channels: Optional[list[str]] = None
    schedule: Optional[str] = None
    scheduled_task: Optional[str] = None
    memory: Optional[dict] = None
    skills: Optional[list[str]] = None
    interaction_rules: Optional[dict] = None
    guardrails: Optional[dict] = None


def agent_to_dict(agent: Agent) -> dict:
    return {
        "id": agent.id,
        "name": agent.name,
        "role": agent.role,
        "systemPrompt": agent.system_prompt,
        "model": agent.model,
        "provider": agent.provider,
        "tools": json.loads(agent.tools),
        "channels": json.loads(agent.channels),
        "schedule": agent.schedule,
        "scheduledTask": agent.scheduled_task,
        "memory": json.loads(agent.memory),
        "skills": json.loads(agent.skills),
        "interactionRules": json.loads(agent.interaction_rules),
        "guardrails": json.loads(agent.guardrails),
        "isTemplate": agent.is_template,
        "status": agent.status,
        "createdAt": agent.created_at,
        "updatedAt": agent.updated_at,
    }


@router.get("")
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(Agent).filter(Agent.is_template == False).all()
    return [agent_to_dict(a) for a in agents]


@router.post("")
def create_agent(req: CreateAgentRequest, db: Session = Depends(get_db)):
    now = utcnow()
    agent = Agent(
        id=new_id(),
        name=req.name,
        role=req.role,
        system_prompt=req.system_prompt,
        model=req.model,
        provider=req.provider,
        tools=json.dumps(req.tools),
        channels=json.dumps(req.channels),
        schedule=req.schedule,
        scheduled_task=req.scheduled_task,
        memory=json.dumps(req.memory),
        skills=json.dumps(req.skills),
        interaction_rules=json.dumps(req.interaction_rules),
        guardrails=json.dumps(req.guardrails),
        status="idle",
        created_at=now,
        updated_at=now,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    goose_manager.register_agent(
        agent.id, agent.name, agent.provider, agent.model,
        json.loads(agent.tools),
    )

    return agent_to_dict(agent)


@router.get("/{agent_id}")
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent_to_dict(agent)


@router.put("/{agent_id}")
def update_agent(agent_id: str, req: UpdateAgentRequest, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    updates = req.model_dump(exclude_none=True)
    json_fields = {"tools", "channels", "memory", "skills", "interaction_rules", "guardrails"}
    for key, value in updates.items():
        db_key = key
        if key in json_fields:
            setattr(agent, db_key, json.dumps(value))
        else:
            setattr(agent, db_key, value)

    agent.updated_at = utcnow()
    db.commit()
    db.refresh(agent)
    return agent_to_dict(agent)


@router.delete("/{agent_id}")
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    goose_manager.kill_agent(agent_id)
    db.delete(agent)
    db.commit()
    return {"deleted": True}


@router.get("/{agent_id}/activity")
def get_activity(agent_id: str, limit: int = 50, db: Session = Depends(get_db)):
    messages = (
        db.query(Message)
        .filter((Message.from_agent_id == agent_id) | (Message.to_agent_id == agent_id))
        .order_by(Message.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [{
        "id": m.id,
        "fromAgentId": m.from_agent_id,
        "toAgentId": m.to_agent_id,
        "content": m.content,
        "type": m.type,
        "channel": m.channel,
        "metadata": json.loads(m.meta),
        "timestamp": m.timestamp,
    } for m in reversed(messages)]
