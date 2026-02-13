"""Transcription API endpoints including WebSocket streaming."""

import asyncio
import json
import struct
import time

from fastapi import APIRouter, UploadFile, File, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse

from app.config import get_settings
from app.services.pipelines.manager import get_pipeline_manager
from app.services.storage_service import get_storage_service

router = APIRouter()

# WebSocket timeout settings
RECEIVE_TIMEOUT = 120  # 2 minutes max recording time
KEEPALIVE_INTERVAL = 2  # Send heartbeat every 2 seconds
MAX_BUFFER_SIZE = 25 * 1024 * 1024  # 25MB safety cutoff (Groq API limit)


@router.post("/transcribe", response_class=PlainTextResponse)
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    pipeline: str = Query(None, description="Pipeline to use (default: from config)")
) -> str:
    """
    Transcribe uploaded audio file to text (Legacy HTTP endpoint).
    """
    settings = get_settings()
    pipeline_key = pipeline or settings.default_pipeline
    
    try:
        audio_bytes = await file.read()
        
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
        manager = get_pipeline_manager()
        pipe = manager.get_pipeline(pipeline_key)
        
        text = await pipe.transcribe(audio_bytes, filename=file.filename or "audio.wav")
        
        # Return the final step's text
        return text[-1].text if text else ""
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


def pcm_to_wav(pcm_data: bytes, sample_rate: int, channels: int = 1, bit_depth: int = 16) -> bytes:
    """Convert raw PCM data to WAV format."""
    byte_rate = sample_rate * channels * (bit_depth // 8)
    block_align = channels * (bit_depth // 8)
    data_size = len(pcm_data)
    
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_size,
        b'WAVE',
        b'fmt ',
        16,
        1,
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bit_depth,
        b'data',
        data_size,
    )
    
    return header + pcm_data


async def process_audio_buffer(
    pcm_buffer: bytearray,
    sample_rate: int,
    user_id: str,
    device_id: str,
    start_time: float,
    trigger: str = "eof",
    api_key: str = None,  # BYOK: Bring Your Own Key
    user_info: object = None,  # UserInfo for proper storage path
    pipeline_name: str = "raw_whisper",
) -> tuple[list, str, str | None]:
    """
    Process the audio buffer and return (step_results, interaction_id, error).
    
    Args:
        pcm_buffer: Raw PCM audio data
        sample_rate: Audio sample rate
        user_id: User identifier (display_name from auth)
        device_id: Device identifier
        start_time: Recording start timestamp
        trigger: What triggered processing ("eof", "disconnect", "size_limit")
        api_key: Optional API key override (BYOK)
        user_info: UserInfo object for proper storage path
        pipeline_name: Pipeline identifier (default: "raw_whisper")
    
    Returns:
        Tuple of (step_results, interaction_id, error_message)
    """
    storage = get_storage_service()
    settings = get_settings()
    manager = get_pipeline_manager()
    
    if len(pcm_buffer) < 100:
        print(f"[WebSocket] Audio too short ({len(pcm_buffer)} bytes), skipping")
        return [], "", None
    
    print(f"[WebSocket] Processing audio: {len(pcm_buffer)} bytes, trigger={trigger}, pipeline={pipeline_name}")
    
    wav_data = pcm_to_wav(bytes(pcm_buffer), sample_rate)
    
    try:
        pipe = manager.get_pipeline(pipeline_name)
    except ValueError:
        print(f"[WebSocket] Invalid pipeline '{pipeline_name}', falling back to default")
        try:
            pipe = manager.get_pipeline(settings.default_pipeline)
        except ValueError:
            from app.services.pipelines.manager import PIPELINE_REGISTRY
            fallback_key = next(iter(PIPELINE_REGISTRY))
            print(f"[WebSocket] Default pipeline '{settings.default_pipeline}' also invalid, using '{fallback_key}'")
            pipe = manager.get_pipeline(fallback_key)
    
    error_msg = None
    step_results = []
    
    # Load user's pipeline config (keywords, user_prompt per step)
    user_config = {}
    if user_info:
        from app.api.pipeline_config import read_user_config
        full_config = read_user_config(user_info)
        user_config = full_config.get(pipeline_name, {})
    
    try:
        # Each step internally tracks its own latency
        step_results = await pipe.transcribe(
            wav_data,
            filename="stream.wav",
            api_key=api_key,
            user_config=user_config,
        )
    except Exception as e:
        print(f"[WebSocket] Transcription failed: {e}")
        from app.services.pipelines.base import StepResult
        step_results = [StepResult(step="error", text=f"[Transcription Error: {str(e)}]", latency_ms=0)]
        error_msg = str(e)
    
    end_time = time.time()
    total_latency_ms = int((end_time - start_time) * 1000)
    
    # Log interaction with WAV data for storage
    entry_data = await storage.log_interaction(
        user_id=user_id,
        device_id=device_id,
        wav_data=wav_data,
        step_results=step_results,
        total_latency_ms=total_latency_ms,
        user_info=user_info,
    )
    interaction_id = entry_data.get("id", "")
    
    # Publish to event bus for real-time web push
    try:
        from app.services.log_events import get_log_event_bus
        bus = get_log_event_bus()
        await bus.publish(entry_data)
    except Exception as e:
        print(f"[WebSocket] Log event publish error: {e}")
    
    final_text = step_results[-1].text if step_results else ""
    print(f"[WebSocket] Transcription complete ({trigger}): {final_text[:50]}...")
    return step_results, interaction_id, error_msg


@router.websocket("/ws/audio")
async def websocket_audio_stream(websocket: WebSocket):
    """
    WebSocket endpoint for streaming audio transcription.
    
    Features:
    - Heartbeat during Groq processing
    - Auto-process on disconnect (graceful degradation)
    - 25MB buffer size limit (Groq API safety)
    """
    await websocket.accept()
    
    settings = get_settings()
    
    pcm_buffer = bytearray()
    sample_rate: int = 16000
    
    # Session identity and config
    current_user_id: str = "guest"
    current_device_id: str = "unknown_device"
    session_api_key: str = settings.groq_api_key  # Default to server key, may be overridden by BYOK
    
    start_time: float = time.time()
    client_connected = True
    config_received = False
    
    async def send_heartbeat():
        """Send periodic heartbeat messages during processing."""
        nonlocal client_connected
        while client_connected:
            try:
                # Send heartbeat IMMEDIATELY, then wait
                # This ensures client gets first heartbeat right away
                await websocket.send_json({"status": "processing"})
                await asyncio.sleep(KEEPALIVE_INTERVAL)
            except Exception:
                client_connected = False
                break
    
    try:
        # Step 1: Receive and parse config (Handshake)
        print("[WebSocket] Waiting for config...")
        config_data = await asyncio.wait_for(
            websocket.receive_text(),
            timeout=10
        )
        config = json.loads(config_data)
        config_received = True
        
        sample_rate = config.get("sample_rate", 16000)
        current_device_id = config.get("device_id", "unknown_device") or "unknown_device"
        
        # Auth and BYOK support
        auth_token = config.get("auth_token")  # Optional authentication
        api_key = config.get("api_key")  # Bring Your Own Key (BYOK)
        pipeline_name = config.get("pipeline") or settings.default_pipeline
        
        # Authentication - user_id comes ONLY from verified auth_token
        user_info = None
        if auth_token:
            from app.services.auth import verify_token
            user_info = verify_token(auth_token)
            if user_info:
                current_user_id = user_info.display_name
                print(f"[WebSocket] Authenticated: {user_info.display_name}")
            else:
                # Invalid token - reject if auth required
                if settings.require_auth:
                    await websocket.send_json({"error": "Invalid auth_token"})
                    await websocket.close(code=4001, reason="Authentication failed")
                    return
                # Otherwise fall through to guest
                current_user_id = "guest"
                print("[WebSocket] Invalid auth_token, using guest mode")
        elif settings.require_auth:
            # Auth required but not provided - reject
            await websocket.send_json({"error": "auth_token required"})
            await websocket.close(code=4001, reason="Authentication required")
            return
        else:
            # No auth required, no token - guest mode
            current_user_id = "guest"
        
        # Store BYOK api_key for later use (will be passed to pipeline)
        session_api_key = api_key
        
        print(f"[WebSocket] Config received: user={current_user_id}, device={current_device_id}, pipeline={pipeline_name}, byok={bool(api_key)}")
        start_time = time.time()
        
        # Step 2: Receive PCM chunks until EOF, disconnect, or size limit
        chunk_count = 0
        
        while True:
            # Safety cutoff: 25MB limit
            if len(pcm_buffer) >= MAX_BUFFER_SIZE:
                print(f"[WebSocket] Buffer size limit reached ({MAX_BUFFER_SIZE} bytes), forcing process")
                break
            
            try:
                message = await asyncio.wait_for(
                    websocket.receive(),
                    timeout=RECEIVE_TIMEOUT
                )
                
            except asyncio.TimeoutError:
                print(f"[WebSocket] Recording timeout after {RECEIVE_TIMEOUT}s")
                break
            except WebSocketDisconnect:
                print(f"[WebSocket] Client disconnected during recording (got {chunk_count} chunks)")
                client_connected = False
                break
            
            # Check for disconnect message type
            if message.get("type") == "websocket.disconnect":
                print(f"[WebSocket] Disconnect message received (got {chunk_count} chunks)")
                client_connected = False
                break
            
            if "text" in message:
                text_data = message["text"]
                if text_data == "EOF":
                    print(f"[WebSocket] EOF received, got {chunk_count} chunks, {len(pcm_buffer)} bytes")
                    break
            elif "bytes" in message:
                pcm_buffer.extend(message["bytes"])
                chunk_count += 1
        
        # Step 3: Process whatever we have in the buffer
        if len(pcm_buffer) >= 100:
            trigger = "eof" if client_connected else "disconnect"
            if len(pcm_buffer) >= MAX_BUFFER_SIZE:
                trigger = "size_limit"
            
            # Start heartbeat if client still connected
            heartbeat_task = None
            if client_connected:
                heartbeat_task = asyncio.create_task(send_heartbeat())
            
            try:
                step_results, interaction_id, error = await process_audio_buffer(
                    pcm_buffer=pcm_buffer,
                    sample_rate=sample_rate,
                    user_id=current_user_id,
                    device_id=current_device_id,
                    start_time=start_time,
                    trigger=trigger,
                    api_key=session_api_key,
                    user_info=user_info,
                    pipeline_name=pipeline_name,
                )
            finally:
                # Stop heartbeat but DON'T set client_connected=False yet
                if heartbeat_task:
                    heartbeat_task.cancel()
                    try:
                        await heartbeat_task
                    except asyncio.CancelledError:
                        pass
            
            # Send result if client still connected
            if client_connected:
                try:
                    final_text = step_results[-1].text if step_results else ""
                    if error:
                        # Send error allows client to play error sound
                        await websocket.send_json({
                            "error": error,
                            "id": interaction_id,
                        })
                    elif final_text:
                        await websocket.send_json({
                            "text": final_text,
                            "id": interaction_id,
                        })
                    
                    # Small delay to ensure client receives before close
                    await asyncio.sleep(0.1)
                except Exception:
                    print("[WebSocket] Failed to send result (client disconnected)")
        else:
            print(f"[WebSocket] Audio too short ({len(pcm_buffer)} bytes), skipped")
        
    except asyncio.TimeoutError:
        print("[WebSocket] Connection timeout during handshake")
    except WebSocketDisconnect:
        # Disconnect during config or early phase
        print(f"[WebSocket] Disconnected (buffer size: {len(pcm_buffer)})")
        if config_received and len(pcm_buffer) >= 100:
            # Still try to process what we have
            await process_audio_buffer(
                pcm_buffer=pcm_buffer,
                sample_rate=sample_rate,
                user_id=current_user_id,
                device_id=current_device_id,
                start_time=start_time,
                trigger="disconnect",
                api_key=session_api_key,
                user_info=user_info,
                pipeline_name=pipeline_name,
            )
    except json.JSONDecodeError:
        try:
            await websocket.send_json({"error": "Invalid config JSON", "text": "", "id": ""})
        except Exception:
            pass
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        # Try to process buffer on any error
        if config_received and len(pcm_buffer) >= 100:
            await process_audio_buffer(
                pcm_buffer=pcm_buffer,
                sample_rate=sample_rate,
                user_id=current_user_id,
                device_id=current_device_id,
                start_time=start_time,
                trigger="error",
                api_key=session_api_key,
                user_info=user_info,
                pipeline_name=pipeline_name,
            )
        try:
            await websocket.send_json({"error": str(e), "text": "", "id": ""})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
