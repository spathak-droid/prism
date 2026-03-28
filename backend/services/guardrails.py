import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from db.models import AgentUsage, Message, new_id, utcnow


def parse_guardrails(guardrails_json: str) -> dict:
    try:
        return json.loads(guardrails_json)
    except (json.JSONDecodeError, TypeError):
        return {"cost_limit": 1.0, "rate_limit": 60, "blocked_actions": []}


def check_rate_limit(db: Session, agent_id: str, limit: int) -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    count = db.query(Message).filter(
        Message.from_agent_id == agent_id,
        Message.timestamp > cutoff,
    ).count()
    return count < limit


def check_cost_limit(db: Session, agent_id: str, limit: float) -> bool:
    usage = db.query(AgentUsage).filter(AgentUsage.agent_id == agent_id).first()
    if not usage:
        return True
    estimated_cost = (usage.approximate_tokens / 1000) * 0.003
    return estimated_cost < limit


def track_usage(db: Session, agent_id: str, tokens: int):
    usage = db.query(AgentUsage).filter(AgentUsage.agent_id == agent_id).first()
    now = utcnow()
    if not usage:
        db.add(AgentUsage(
            id=new_id(), agent_id=agent_id,
            message_count=1, approximate_tokens=tokens,
            last_reset_at=now, updated_at=now,
        ))
    else:
        usage.message_count += 1
        usage.approximate_tokens += tokens
        usage.updated_at = now
    db.commit()


def format_guardrails_for_prompt(config: dict) -> str:
    parts = []
    if config.get("cost_limit"):
        parts.append(f"- Cost limit: ${config['cost_limit']:.2f}")
    if config.get("rate_limit"):
        parts.append(f"- Rate limit: {config['rate_limit']} messages/minute")
    if config.get("blocked_actions"):
        parts.append(f"- Blocked actions: {', '.join(config['blocked_actions'])}")
    return "\n".join(parts) if parts else "No guardrails configured."
