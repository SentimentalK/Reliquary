"""
Log Event Bus - Simple pub/sub for real-time log push.

When a new log entry is saved, publish it here.
Web frontend subscribes via /ws/logs to receive live updates.
"""

import asyncio
from typing import Dict, Set, Tuple
from fastapi import WebSocket


class LogEventBus:
    """Broadcast new log entries to connected web clients, scoped per user."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            # Map: WebSocket -> user_prefix (storage prefix for scoping)
            cls._instance._subscribers: Dict[WebSocket, str] = {}
        return cls._instance
    
    def subscribe(self, ws: WebSocket, user_prefix: str):
        self._subscribers[ws] = user_prefix
    
    def unsubscribe(self, ws: WebSocket):
        self._subscribers.pop(ws, None)
    
    async def publish(self, entry: dict, user_prefix: str = ""):
        """Broadcast a new log entry to subscribers matching the user_prefix."""
        dead = []
        for ws, prefix in self._subscribers.items():
            # Only send to subscribers for this user (or if no scoping)
            if user_prefix and prefix and prefix != user_prefix:
                continue
            try:
                await ws.send_json({"type": "new_entry", "entry": entry})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._subscribers.pop(ws, None)


def get_log_event_bus() -> LogEventBus:
    """Get the singleton LogEventBus instance."""
    return LogEventBus()

