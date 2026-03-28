import asyncio
import json
from typing import Any, Callable
from datetime import datetime, timezone


class EventBus:
    """In-process pub/sub. Listeners are async callbacks."""

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

    async def emit(self, event_type: str, data: dict[str, Any]):
        event = {
            "type": event_type,
            **data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
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
