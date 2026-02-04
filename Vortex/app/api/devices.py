"""
Devices API - Control Plane WebSocket and REST endpoints.

This module provides:
1. WebSocket `/ws/control` - Persistent control channel for reverse control
2. REST endpoints for triggering device actions (learn hotkey, push config)

Key Learning Flow:
1. POST /api/devices/{device_id}/learn_hotkey -> Server pushes "start_learning"
2. Client enters listening mode, captures next key press
3. Client sends {"type": "key_detected", "code": <keycode>} back via WebSocket
4. Server AUTOMATICALLY pushes config_update with the new key (v1.4 optimization)

Optimizations (v1.4):
- Server-side heartbeat every 30s to prevent connection timeout
- Initial config sync when client connects
- Auto-push config after key learning completes
"""

import asyncio
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from app.services.connection_manager import get_connection_manager

router = APIRouter()

# Timeout and heartbeat settings
CONTROL_RECEIVE_TIMEOUT = 60   # 1 minute between messages (heartbeat will keep alive)
HEARTBEAT_INTERVAL = 30        # Send heartbeat every 30 seconds


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

# Store for device configurations (device_id -> config dict)
# In production, this should be persisted to a database
_device_configs: Dict[str, Dict[str, Any]] = {}


def get_device_config(device_id: str) -> Dict[str, Any]:
    """Get stored config for a device, or return defaults."""
    if device_id not in _device_configs:
        _device_configs[device_id] = {
            "keycode": 61,  # Default: Right Option on macOS
            "language": "zh",
        }
    return _device_configs[device_id]


def update_device_config(device_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update and return the device config."""
    config = get_device_config(device_id)
    config.update(updates)
    _device_configs[device_id] = config
    return config


@router.websocket("/ws/control")
async def websocket_control_plane(websocket: WebSocket):
    """
    Control Plane WebSocket endpoint.
    
    Handshake Protocol:
    1. Client connects
    2. Client sends: {"device_id": "...", "user_id": "..."}
    3. Server accepts, registers connection, and pushes current config
    4. Bidirectional message loop with server-side heartbeat:
       - Server -> Client: {"type": "config_update" | "start_learning" | "heartbeat", "payload": {...}}
       - Client -> Server: {"type": "key_detected", "code": 123}
    
    The connection should remain open indefinitely for push notifications.
    """
    await websocket.accept()
    
    manager = get_connection_manager()
    device_id: str | None = None
    user_id: str = "unknown_user"
    heartbeat_task: Optional[asyncio.Task] = None
    
    async def send_heartbeat():
        """Background task to send periodic heartbeats."""
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                try:
                    await websocket.send_json({"type": "heartbeat", "payload": {}})
                except Exception:
                    break  # Connection closed
        except asyncio.CancelledError:
            pass
    
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
        auth_token = handshake.get("auth_token")  # Optional authentication
        
        if not device_id:
            await websocket.send_json({"error": "device_id required in handshake"})
            await websocket.close(code=1008, reason="Missing device_id")
            return
        
        # Step 2: Authenticate (optional, based on config)
        user_info = None
        from app.config import get_settings
        settings = get_settings()
        
        if auth_token:
            from app.services.auth import verify_token
            user_info = verify_token(auth_token)
            if not user_info:
                await websocket.send_json({"error": "Invalid auth_token"})
                await websocket.close(code=4001, reason="Authentication failed")
                return
            # Use authenticated user's display name
            user_id = user_info.display_name
            print(f"[Control] Authenticated: {user_info.display_name} (role: {user_info.role})")
        elif settings.require_auth:
            await websocket.send_json({"error": "auth_token required"})
            await websocket.close(code=4001, reason="Authentication required")
            return
        
        # Step 3: Register connection with user info
        await manager.connect(device_id, user_id, websocket, user_info)
        
        # Step 4: Send acknowledgment with INITIAL CONFIG SYNC
        current_config = get_device_config(device_id)
        await websocket.send_json({
            "type": "connected",
            "payload": {
                "device_id": device_id,
                "user_id": user_id,
                "authenticated": user_info is not None,
                "message": "Control plane connected successfully"
            }
        })
        
        # Push initial config sync
        print(f"[Control] Pushing initial config to {device_id}: {current_config}")
        await websocket.send_json({
            "type": "config_update",
            "payload": current_config
        })
        
        # Step 5: Start heartbeat background task
        heartbeat_task = asyncio.create_task(send_heartbeat())
        
        # Step 5: Message loop - listen for client messages
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
                    raw_text = message["text"]
                    print(f"[Control] Raw message from {device_id}: {raw_text[:200]}")
                    try:
                        data = json.loads(raw_text)
                        await handle_client_message(device_id, user_id, data, websocket)
                    except json.JSONDecodeError as e:
                        print(f"[Control] Invalid JSON from {device_id}: {e}")
                
            except asyncio.TimeoutError:
                # No message received, but heartbeat keeps connection alive
                # This shouldn't happen often with 30s heartbeat and 60s timeout
                print(f"[Control] Device {device_id} receive timeout, checking connection...")
                try:
                    await websocket.send_json({"type": "ping", "payload": {}})
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
        # Cancel heartbeat
        if heartbeat_task:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        
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


async def handle_client_message(
    device_id: str, 
    user_id: str, 
    data: Dict[str, Any],
    websocket: WebSocket
) -> None:
    """
    Handle messages received from client on control channel.
    
    Supported message types:
    - key_detected: Client reports detected key code during learning mode
                    -> AUTO-PUSH config_update with new keycode (v1.4)
    - pong: Response to ping (for keepalive)
    """
    msg_type = data.get("type")
    
    if msg_type == "key_detected":
        # Client sends: {"type": "key_detected", "payload": {"code": 60}}
        payload = data.get("payload", {})
        code = payload.get("code") if isinstance(payload, dict) else data.get("code")
        
        if code is not None:
            print(f"[Control] Device {device_id} detected key code: {code}")
            
            # Resolve pending future if exists (for REST API waiting)
            if device_id in _pending_key_learning:
                future = _pending_key_learning.pop(device_id)
                if not future.done():
                    future.set_result(code)
            
            # ===== OPTIMIZATION: Auto-push config update =====
            # Update server-side config store
            update_device_config(device_id, {"keycode": code})
            
            # Push the new config back to the client immediately
            print(f"[Control] Auto-pushing new keycode {code} to {device_id}")
            try:
                await websocket.send_json({
                    "type": "config_update",
                    "payload": {"keycode": code}
                })
            except Exception as e:
                print(f"[Control] Failed to auto-push config: {e}")
        else:
            print(f"[Control] key_detected missing code field: {data}")
    
    elif msg_type == "pong":
        # Keepalive response, no action needed
        pass
    
    elif msg_type == "heartbeat_ack":
        # Client acknowledged heartbeat
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
    
    # Create future for result using running loop (important for FastAPI)
    loop = asyncio.get_running_loop()
    future: asyncio.Future = loop.create_future()
    _pending_key_learning[device_id] = future
    
    print(f"[LearnHotkey] Started waiting for key from {device_id} (timeout={timeout}s)")
    
    try:
        # Send learning command
        success = await manager.push_command(device_id, "start_learning")
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send learning command")
        
        print(f"[LearnHotkey] Sent start_learning to {device_id}, waiting for key_detected...")
        
        # Wait for key detection
        key_code = await asyncio.wait_for(future, timeout=timeout)
        
        print(f"[LearnHotkey] Got key_code={key_code} from {device_id}")
        return {"success": True, "key_code": key_code}
    
    except asyncio.TimeoutError:
        print(f"[LearnHotkey] Timeout waiting for {device_id}")
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
