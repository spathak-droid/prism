import asyncio
import json
from typing import Any, Callable
from datetime import datetime, timezone


class EventBus:
    """In-process pub/sub. Listeners are async callbacks. Persists to DB."""

    def __init__(self):
        self._listeners: dict[str, list[Callable]] = {}
        self._all_listeners: list[Callable] = []

    def on(self, event_type: str, callback: Callable):
        self._listeners.setdefault(event_type, []).append(callback)

    def on_all(self, callback: Callable):
        self._all_listeners.append(callback)

    def off(self, event_type: str, callback: Callable):
        if event_type in self._listeners:
            self._listeners[event_type] = [
                cb for cb in self._listeners[event_type] if cb != callback
            ]

    def _persist(self, event_type: str, data: dict[str, Any], timestamp: str):
        try:
            from db.database import SessionLocal
            from db.models import Event, new_id
            db = SessionLocal()
            try:
                db.add(Event(
                    id=new_id(),
                    type=event_type,
                    agent_id=data.get("agent_id"),
                    project_id=data.get("project_id"),
                    channel=data.get("channel"),
                    direction=data.get("direction"),
                    status=data.get("status"),
                    content=data.get("content"),
                    tool_name=data.get("tool_name"),
                    tool_type=data.get("tool_type"),
                    workflow_id=data.get("workflow_id"),
                    execution_id=data.get("execution_id"),
                    meta=json.dumps({k: v for k, v in data.items() if k not in (
                        "agent_id", "project_id", "channel", "direction",
                        "status", "content", "tool_name", "tool_type",
                        "workflow_id", "execution_id",
                    )}),
                    timestamp=timestamp,
                ))
                db.commit()
            finally:
                db.close()
        except Exception as e:
            print(f"[EventBus] Failed to persist event: {e}")

    async def emit(self, event_type: str, data: dict[str, Any]):
        ts = datetime.now(timezone.utc).isoformat()
        event = {
            "type": event_type,
            **data,
            "timestamp": ts,
        }
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._persist, event_type, data, ts)
        for cb in self._listeners.get(event_type, []):
            try:
                await cb(event)
            except Exception as e:
                print(f"[EventBus] Error in listener for {event_type}: {e}")
        for cb in self._all_listeners:
            try:
                await cb(event)
            except Exception as e:
                print(f"[EventBus] Error in all-listener: {e}")


event_bus = EventBus()
