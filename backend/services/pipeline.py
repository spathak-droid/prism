"""Pipeline middleware: assembles system prompt, checks guardrails, tracks usage."""
import json
from typing import AsyncGenerator, Optional
from sqlalchemy.orm import Session
from services.goose_manager import goose_manager, StreamChunk
from services.skill_loader import build_prompt_with_skills
from services.guardrails import (
    parse_guardrails, check_rate_limit, check_cost_limit,
    track_usage, format_guardrails_for_prompt,
)


async def send_through_pipeline(
    agent_id: str,
    message: str,
    db: Session,
    agent_data: dict,
    cwd: Optional[str] = None,
    max_turns: int = 15,
) -> AsyncGenerator[StreamChunk, None]:
    guardrails = parse_guardrails(agent_data.get("guardrails", "{}"))
    if not check_rate_limit(db, agent_id, guardrails.get("rate_limit", 60)):
        yield StreamChunk(type="text", content="Rate limit exceeded. Please wait.")
        return
    if not check_cost_limit(db, agent_id, guardrails.get("cost_limit", 1.0)):
        yield StreamChunk(type="text", content="Cost limit exceeded.")
        return

    base_prompt = agent_data.get("system_prompt", "You are a helpful AI agent.")
    skills = json.loads(agent_data.get("skills", "[]"))
    assembled = build_prompt_with_skills(base_prompt, skills, db)

    memory = json.loads(agent_data.get("memory", "{}"))
    if memory:
        memory_lines = [f"- {k}: {v}" for k, v in memory.items()]
        assembled += f"\n\n## PERSISTENT MEMORY\n" + "\n".join(memory_lines)

    assembled += f"\n\n## GUARDRAILS\n{format_guardrails_for_prompt(guardrails)}"

    total_text = ""
    async for chunk in goose_manager.send_message(
        agent_id=agent_id,
        message=message,
        system_prompt=assembled,
        cwd=cwd,
        max_turns=max_turns,
    ):
        if chunk.type == "text":
            total_text += chunk.content
        yield chunk

    estimated_tokens = len(total_text) // 4
    track_usage(db, agent_id, estimated_tokens)
