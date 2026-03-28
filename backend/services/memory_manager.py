"""Extract and persist facts from agent conversations."""
import json
from typing import Optional
from db.database import SessionLocal
from db.models import Agent, utcnow


def extract_memory_from_response(response: str) -> dict[str, str]:
    """Simple keyword extraction for persistent facts."""
    facts = {}

    # Look for explicit memory markers
    lines = response.split('\n')
    for line in lines:
        line = line.strip()
        # Pattern: [REMEMBER] key: value
        if line.startswith('[REMEMBER]'):
            parts = line[len('[REMEMBER]'):].strip().split(':', 1)
            if len(parts) == 2:
                facts[parts[0].strip()] = parts[1].strip()
        # Pattern: **Remember:** key = value
        elif 'remember:' in line.lower():
            idx = line.lower().index('remember:')
            rest = line[idx + 9:].strip()
            parts = rest.split('=', 1)
            if len(parts) == 2:
                facts[parts[0].strip()] = parts[1].strip()

    return facts


def update_agent_memory(agent_id: str, new_facts: dict[str, str]):
    """Merge new facts into agent's persistent memory."""
    if not new_facts:
        return

    db = SessionLocal()
    try:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent:
            return

        existing = json.loads(agent.memory or '{}')
        existing.update(new_facts)
        agent.memory = json.dumps(existing)
        agent.updated_at = utcnow()
        db.commit()
    finally:
        db.close()


def get_agent_memory(agent_id: str) -> dict[str, str]:
    """Get agent's persistent memory."""
    db = SessionLocal()
    try:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent:
            return {}
        return json.loads(agent.memory or '{}')
    finally:
        db.close()


def clear_agent_memory(agent_id: str):
    """Clear agent's persistent memory."""
    db = SessionLocal()
    try:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if agent:
            agent.memory = '{}'
            agent.updated_at = utcnow()
            db.commit()
    finally:
        db.close()
