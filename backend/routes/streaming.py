import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
from services.event_bus import event_bus
from services.goose_manager import goose_manager

router = APIRouter(tags=["streaming"])


@router.get("/api/stream/{agent_id}")
async def stream_agent(agent_id: str):
    queue: asyncio.Queue = asyncio.Queue()

    async def on_event(event: dict):
        if event.get("agent_id") == agent_id:
            await queue.put(event)

    event_bus.on("agent:tool", on_event)
    event_bus.on("agent:status", on_event)
    event_bus.on("agent:message", on_event)

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
            event_bus.off("agent:tool", on_event)
            event_bus.off("agent:status", on_event)
            event_bus.off("agent:message", on_event)

    return EventSourceResponse(generate())


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
