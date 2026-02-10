"""
Connection Manager for Control Plane WebSocket connections.

This singleton service manages persistent WebSocket connections for the Control Channel,
enabling real-time server-to-client communication (reverse control).

Philosophy: "Config as Cache"
- Server is the "Source of Truth" for configuration
- Client's local config is a Cache that gets updated via push commands
"""

import asyncio
import json
from typing import Dict, Optional, Any
from dataclasses import dataclass, field
from fastapi import WebSocket


@dataclass
class DeviceConnection:
    """Represents an active device connection."""
    device_id: str
    user_id: str
    websocket: WebSocket
    connected_at: float
    # Authenticated user info (from auth service)
    user_info: Optional[Any] = None  # UserInfo from auth.py
    platform: Optional[str] = None  # "android", "macos", "windows" etc.


class ConnectionManager:
    """
    Singleton manager for active Control Plane WebSocket connections.
    
    Provides:
    - Connection tracking by device_id
    - Push commands to connected devices
    - Connection lifecycle management
    - Role-based device visibility
    """
    
    _instance: Optional["ConnectionManager"] = None
    
    def __new__(cls) -> "ConnectionManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._connections: Dict[str, DeviceConnection] = {}
        self._lock = asyncio.Lock()
    
    @property
    def active_connections(self) -> Dict[str, WebSocket]:
        """Return dict of device_id -> WebSocket for all active connections."""
        return {device_id: conn.websocket for device_id, conn in self._connections.items()}
    
    async def connect(
        self,
        device_id: str,
        user_id: str,
        websocket: WebSocket,
        user_info: Optional[Any] = None,
        platform: Optional[str] = None
    ) -> None:
        """
        Register a new device connection.
        
        If device is already connected (reconnection), closes the old connection first.
        
        Args:
            device_id: Unique device identifier
            user_id: User identifier
            websocket: FastAPI WebSocket instance
            user_info: Authenticated user info (from auth service)
            platform: Client platform ("android", "macos", "windows" etc.)
        """
        import time
        
        async with self._lock:
            # Close existing connection if present (reconnection scenario)
            if device_id in self._connections:
                old_conn = self._connections[device_id]
                try:
                    await old_conn.websocket.close(code=1000, reason="Reconnected from another session")
                except Exception:
                    pass  # Already closed
                print(f"[ConnectionManager] Device {device_id} reconnected (closed old connection)")
            
            self._connections[device_id] = DeviceConnection(
                device_id=device_id,
                user_id=user_id,
                websocket=websocket,
                connected_at=time.time(),
                user_info=user_info,
                platform=platform,
            )
            print(f"[ConnectionManager] Device {device_id} connected (user: {user_id}, platform: {platform or 'desktop'})")
    
    async def disconnect(self, device_id: str) -> None:
        """
        Unregister a device connection.
        
        Args:
            device_id: Device identifier to disconnect
        """
        async with self._lock:
            if device_id in self._connections:
                del self._connections[device_id]
                print(f"[ConnectionManager] Device {device_id} disconnected")
    
    async def push_command(
        self,
        device_id: str,
        command_type: str,
        payload: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Send a command to a specific device via its Control Plane connection.
        
        Message format: {"type": "<command_type>", "payload": {...}}
        
        Args:
            device_id: Target device identifier
            command_type: Command type (e.g., "config_update", "start_learning")
            payload: Optional payload data for the command
        
        Returns:
            True if command was sent successfully, False otherwise
        """
        conn = self._connections.get(device_id)
        if conn is None:
            print(f"[ConnectionManager] Device {device_id} not connected, cannot push command")
            return False
        
        message = {
            "type": command_type,
            "payload": payload or {},
        }
        
        try:
            await conn.websocket.send_json(message)
            print(f"[ConnectionManager] Sent {command_type} to device {device_id}")
            return True
        except Exception as e:
            print(f"[ConnectionManager] Failed to send to {device_id}: {e}")
            # Clean up dead connection
            await self.disconnect(device_id)
            return False
    
    async def broadcast_to_user(
        self,
        user_id: str,
        command_type: str,
        payload: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Send a command to all devices belonging to a specific user.
        
        Args:
            user_id: Target user identifier
            command_type: Command type
            payload: Optional payload data
        
        Returns:
            Number of devices that received the command
        """
        sent_count = 0
        device_ids = [
            device_id for device_id, conn in self._connections.items()
            if conn.user_id == user_id
        ]
        
        for device_id in device_ids:
            if await self.push_command(device_id, command_type, payload):
                sent_count += 1
        
        return sent_count
    
    def is_connected(self, device_id: str) -> bool:
        """Check if a device is currently connected."""
        return device_id in self._connections
    
    def get_connection_info(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get connection info for a device."""
        conn = self._connections.get(device_id)
        if conn is None:
            return None
        
        # Determine display name
        display_name = conn.user_id
        if conn.user_info:
            display_name = conn.user_info.display_name
            
        return {
            "device_id": conn.device_id,
            "user_id": conn.user_id,
            "display_name": display_name,
            "connected_at": conn.connected_at,
            "platform": conn.platform,
        }
    
    def list_devices(self, user_id: Optional[str] = None) -> list[str]:
        """
        List connected device IDs, optionally filtered by user.
        
        Args:
            user_id: Optional user filter
        
        Returns:
            List of device IDs
        """
        if user_id is None:
            return list(self._connections.keys())
        return [
            device_id for device_id, conn in self._connections.items()
            if conn.user_id == user_id
        ]
    
    def get_all_connections(self, requesting_user: Optional[Any] = None) -> list[Dict[str, Any]]:
        """
        Get all connection info with role-based filtering.
        
        Args:
            requesting_user: UserInfo of the requesting user
                - If admin: returns ALL connections
                - If user: returns only their own connections
                - If None: returns empty list
        
        Returns:
            List of connection info dicts
        """
        if requesting_user is None:
            return []
        
        connections = []
        for device_id, conn in self._connections.items():
            # Admin sees all, user sees only own devices
            if requesting_user.role == "admin" or conn.user_id == requesting_user.display_name:
                connections.append({
                    "device_id": conn.device_id,
                    "user_id": conn.user_id,
                    "connected_at": conn.connected_at,
                    "platform": conn.platform,
                })
        
        return connections


# Singleton accessor
def get_connection_manager() -> ConnectionManager:
    """Get the singleton ConnectionManager instance."""
    return ConnectionManager()

