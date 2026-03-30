import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
from db.database import get_db
from db.models import Agent, Message, new_id, utcnow
from services.event_bus import event_bus
from services.goose_manager import goose_manager
from services.pipeline import send_through_pipeline

router = APIRouter(tags=["streaming"])


@router.get("/api/stream/{agent_id}")
async def stream_agent(agent_id: str, message: str = "", db: Session = Depends(get_db)):
    """Stream a conversation with an agent. If message is provided, send it first."""
    if not message:
        # Read-only listener for events
        queue: asyncio.Queue = asyncio.Queue()

        async def on_event(event: dict):
            if event.get("agent_id") == agent_id:
                await queue.put(event)

        event_bus.on("agent:tool", on_event)
        event_bus.on("agent:status", on_event)
        event_bus.on("agent:message", on_event)

        async def generate_listen():
            try:
                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=30)
                        yield {"data": json.dumps(event)}
                    except asyncio.TimeoutError:
                        yield {"data": json.dumps({"type": "heartbeat"})}
            except asyncio.CancelledError:
                pass
            finally:
                event_bus.off("agent:tool", on_event)
                event_bus.off("agent:status", on_event)
                event_bus.off("agent:message", on_event)

        return EventSourceResponse(generate_listen())

    # Message provided — send through pipeline and stream back
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if goose_manager.get_status(agent_id) == "idle":
        goose_manager.register_agent(
            agent.id, agent.name, agent.provider, agent.model,
            json.loads(agent.tools),
        )

    # Save user message
    user_msg = Message(
        id=new_id(), from_agent_id=None, to_agent_id=agent_id,
        content=message, type="text", channel="internal",
        timestamp=utcnow(),
    )
    db.add(user_msg)
    db.commit()

    await event_bus.emit("agent:message", {
        "agent_id": agent_id, "direction": "incoming",
        "content": message[:200], "channel": "internal",
    })

    agent_dict = {
        "system_prompt": agent.system_prompt,
        "skills": agent.skills,
        "memory": agent.memory,
        "guardrails": agent.guardrails,
    }

    async def generate_response():
        response_text = ""
        try:
            async for chunk in send_through_pipeline(
                agent_id=agent_id,
                message=message,
                db=db,
                agent_data=agent_dict,
            ):
                if chunk.type == "text":
                    response_text += chunk.content
                    yield {"data": json.dumps({"type": "text", "content": chunk.content})}
                elif chunk.type == "tool_request":
                    yield {"data": json.dumps({
                        "type": "tool_use",
                        "toolName": chunk.tool_name or "tool",
                        "toolArgs": chunk.content,
                    })}
                elif chunk.type == "tool_response":
                    yield {"data": json.dumps({
                        "type": "tool_result",
                        "toolName": chunk.tool_name or "tool",
                        "content": chunk.content,
                    })}

            # Save assistant message
            if response_text:
                assistant_msg = Message(
                    id=new_id(), from_agent_id=agent_id, to_agent_id=None,
                    content=response_text, type="text", channel="internal",
                    timestamp=utcnow(),
                )
                db.add(assistant_msg)
                db.commit()

                await event_bus.emit("agent:message", {
                    "agent_id": agent_id, "direction": "outgoing",
                    "content": response_text[:200], "channel": "internal",
                })

            yield {"data": "[DONE]"}

        except Exception as e:
            yield {"data": json.dumps({"type": "error", "error": str(e)})}
            yield {"data": "[DONE]"}

    return EventSourceResponse(generate_response())


@router.get("/api/events")
async def stream_all_events():
    queue: asyncio.Queue = asyncio.Queue()

    async def on_event(event: dict):
        await queue.put(event)

    event_bus.on_all(on_event)

    async def generate():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield {"data": json.dumps(event)}
                except asyncio.TimeoutError:
                    yield {"data": json.dumps({"type": "heartbeat"})}
        except asyncio.CancelledError:
            pass
        finally:
            event_bus._all_listeners.remove(on_event)

    return EventSourceResponse(generate())
