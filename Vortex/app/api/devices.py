"""
Devices API - Control Plane WebSocket and REST endpoints.

This module provides:
1. WebSocket `/ws/control` - Persistent control channel for reverse control
2. REST endpoints for triggering device actions (learn hotkey, push config)

Key Learning Flow:
1. POST /api/devices/{device_id}/learn_hotkey -> Server pushes "start_learning"
2. Client enters listening mode, captures next key press
3. Client sends {"type": "key_detected", "code": <keycode>} back via WebSocket
4. Server can then push config_update with the new key
"""

import asyncio
import json
from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from app.services.connection_manager import get_connection_manager

router = APIRouter()

# Timeout for control plane operations
CONTROL_RECEIVE_TIMEOUT = 300  # 5 minutes - control plane should be long-lived


class ConfigUpdateRequest(BaseModel):
    """Request body for config update."""
    keycode: int | None = None
    server_url: str | None = None
    language: str | None = None
    # Add more config fields as needed


class LearnHotkeyResponse(BaseModel):
    """Response for learn hotkey request."""
    success: bool
    message: str
    device_connected: bool


class KeyDetectedEvent(BaseModel):
    """Event received when client detects a key during learning mode."""
    code: int


# Store for pending key learning callbacks (device_id -> asyncio.Future)
_pending_key_learning: Dict[str, asyncio.Future] = {}


@router.websocket("/ws/control")
async def websocket_control_plane(websocket: WebSocket):
    """
    Control Plane WebSocket endpoint.
    
    Handshake Protocol:
    1. Client connects
    2. Client sends: {"device_id": "...", "user_id": "..."}
    3. Server accepts and registers connection
    4. Bidirectional message loop:
       - Server -> Client: {"type": "config_update" | "start_learning", "payload": {...}}
       - Client -> Server: {"type": "key_detected", "code": 123}
    
    The connection should remain open indefinitely for push notifications.
    """
    await websocket.accept()
    
    manager = get_connection_manager()
    device_id: str | None = None
    
    try:
        # Step 1: Receive handshake with identity
        print("[Control] Waiting for handshake...")
        handshake_data = await asyncio.wait_for(
            websocket.receive_text(),
            timeout=30  # 30 second handshake timeout
        )
        
        handshake = json.loads(handshake_data)
        device_id = handshake.get("device_id")
        user_id = handshake.get("user_id", "unknown_user")
        
        if not device_id:
            await websocket.send_json({"error": "device_id required in handshake"})
            await websocket.close(code=1008, reason="Missing device_id")
            return
        
        # Step 2: Register connection
        await manager.connect(device_id, user_id, websocket)
        
        # Send acknowledgment
        await websocket.send_json({
            "type": "connected",
            "payload": {
                "device_id": device_id,
                "message": "Control plane connected successfully"
            }
        })
        
        # Step 3: Message loop - listen for client messages
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive(),
                    timeout=CONTROL_RECEIVE_TIMEOUT
                )
                
                # Handle disconnect
                if message.get("type") == "websocket.disconnect":
                    print(f"[Control] Device {device_id} disconnect message received")
                    break
                
                if "text" in message:
                    try:
                        data = json.loads(message["text"])
                        await handle_client_message(device_id, data)
                    except json.JSONDecodeError:
                        print(f"[Control] Invalid JSON from {device_id}")
                
            except asyncio.TimeoutError:
                # Send ping to check if connection is still alive
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    print(f"[Control] Device {device_id} ping failed, closing")
                    break
    
    except asyncio.TimeoutError:
        print("[Control] Handshake timeout")
    except WebSocketDisconnect:
        print(f"[Control] Device {device_id or 'unknown'} disconnected")
    except json.JSONDecodeError:
        print("[Control] Invalid handshake JSON")
        try:
            await websocket.send_json({"error": "Invalid JSON in handshake"})
        except Exception:
            pass
    except Exception as e:
        print(f"[Control] Error: {e}")
    finally:
        if device_id:
            await manager.disconnect(device_id)
            # Cancel any pending key learning for this device
            if device_id in _pending_key_learning:
                future = _pending_key_learning.pop(device_id)
                if not future.done():
                    future.cancel()
        try:
            await websocket.close()
        except Exception:
            pass


async def handle_client_message(device_id: str, data: Dict[str, Any]) -> None:
    """
    Handle messages received from client on control channel.
    
    Supported message types:
    - key_detected: Client reports detected key code during learning mode
    - pong: Response to ping (for keepalive)
    """
    msg_type = data.get("type")
    
    if msg_type == "key_detected":
        code = data.get("code")
        if code is not None:
            print(f"[Control] Device {device_id} detected key code: {code}")
            # Resolve pending future if exists
            if device_id in _pending_key_learning:
                future = _pending_key_learning.pop(device_id)
                if not future.done():
                    future.set_result(code)
    
    elif msg_type == "pong":
        # Keepalive response, no action needed
        pass
    
    else:
        print(f"[Control] Unknown message type from {device_id}: {msg_type}")


# ============== REST Endpoints ==============

@router.post("/api/devices/{device_id}/learn_hotkey", response_model=LearnHotkeyResponse)
async def learn_hotkey(device_id: str) -> LearnHotkeyResponse:
    """
    Initiate hotkey learning mode on a device.
    
    This sends a "start_learning" command to the device, which will:
    1. Enter listening mode
    2. Capture the next key press
    3. Report the key code back via WebSocket
    
    The endpoint returns immediately after sending the command.
    Use the WebSocket channel to receive the detected key code.
    """
    manager = get_connection_manager()
    
    if not manager.is_connected(device_id):
        return LearnHotkeyResponse(
            success=False,
            message=f"Device {device_id} is not connected",
            device_connected=False,
        )
    
    success = await manager.push_command(device_id, "start_learning")
    
    return LearnHotkeyResponse(
        success=success,
        message="Learning mode initiated" if success else "Failed to send command",
        device_connected=True,
    )


@router.post("/api/devices/{device_id}/learn_hotkey/wait")
async def learn_hotkey_and_wait(device_id: str, timeout: int = 30) -> Dict[str, Any]:
    """
    Initiate hotkey learning and wait for the result.
    
    This is a blocking endpoint that:
    1. Sends "start_learning" to the device
    2. Waits for the device to report the detected key code
    3. Returns the detected key code
    
    Args:
        device_id: Target device
        timeout: Max seconds to wait for key detection (default: 30)
    
    Returns:
        {"success": true, "key_code": 123} on success
        {"success": false, "error": "..."} on failure
    """
    manager = get_connection_manager()
    
    if not manager.is_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")
    
    # Create future for result
    loop = asyncio.get_event_loop()
    future: asyncio.Future = loop.create_future()
    _pending_key_learning[device_id] = future
    
    try:
        # Send learning command
        success = await manager.push_command(device_id, "start_learning")
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send learning command")
        
        # Wait for key detection
        key_code = await asyncio.wait_for(future, timeout=timeout)
        
        return {"success": True, "key_code": key_code}
    
    except asyncio.TimeoutError:
        return {"success": False, "error": f"Timeout waiting for key (>{timeout}s)"}
    except asyncio.CancelledError:
        return {"success": False, "error": "Device disconnected during learning"}
    finally:
        # Cleanup
        _pending_key_learning.pop(device_id, None)


@router.post("/api/devices/{device_id}/config")
async def push_config_update(device_id: str, config: ConfigUpdateRequest) -> Dict[str, Any]:
    """
    Push a configuration update to a device.
    
    The device will update its in-memory config and persist to voice_config.json.
    
    Args:
        device_id: Target device
        config: New configuration values (only non-null fields are updated)
    
    Returns:
        {"success": true} on success
    """
    manager = get_connection_manager()
    
    if not manager.is_connected(device_id):
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")
    
    # Build payload with only non-null fields
    payload = {k: v for k, v in config.model_dump().items() if v is not None}
    
    if not payload:
        raise HTTPException(status_code=400, detail="No config fields provided")
    
    success = await manager.push_command(device_id, "config_update", payload)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to push config update")
    
    return {"success": True, "updated_fields": list(payload.keys())}


@router.get("/api/devices")
async def list_devices(user_id: str | None = None) -> Dict[str, Any]:
    """
    List all connected devices.
    
    Args:
        user_id: Optional filter by user
    
    Returns:
        {"devices": [{"device_id": "...", "user_id": "...", ...}, ...]}
    """
    manager = get_connection_manager()
    device_ids = manager.list_devices(user_id)
    
    devices = []
    for device_id in device_ids:
        info = manager.get_connection_info(device_id)
        if info:
            devices.append(info)
    
    return {"devices": devices, "count": len(devices)}


@router.get("/api/devices/{device_id}")
async def get_device_status(device_id: str) -> Dict[str, Any]:
    """
    Get connection status for a specific device.
    """
    manager = get_connection_manager()
    
    info = manager.get_connection_info(device_id)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not connected")
    
    return {"connected": True, **info}
