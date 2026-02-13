"""
Log Event Bus - Simple pub/sub for real-time log push.

When a new log entry is saved, publish it here.
Web frontend subscribes via /ws/logs to receive live updates.
"""

import asyncio
from typing import Set
from fastapi import WebSocket


class LogEventBus:
    """Broadcast new log entries to connected web clients."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._subscribers: Set[WebSocket] = set()
        return cls._instance
    
    def subscribe(self, ws: WebSocket):
        self._subscribers.add(ws)
    
    def unsubscribe(self, ws: WebSocket):
        self._subscribers.discard(ws)
    
    async def publish(self, entry: dict):
        """Broadcast a new log entry to all connected web clients."""
        dead = []
        for ws in self._subscribers:
            try:
                await ws.send_json({"type": "new_entry", "entry": entry})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._subscribers.discard(ws)


def get_log_event_bus() -> LogEventBus:
    """Get the singleton LogEventBus instance."""
    return LogEventBus()
