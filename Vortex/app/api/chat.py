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


@router.post("/transcribe", response_class=PlainTextResponse)
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    pipeline: str = Query(None, description="Pipeline to use (default: from config)")
) -> str:
    """
    Transcribe uploaded audio file to text (Legacy HTTP endpoint).
    
    - **file**: Audio file (WAV, MP3, etc.)
    - **pipeline**: Optional pipeline key (default: "raw")
    
    Returns plain text transcription.
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
        
        return text
        
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


@router.websocket("/ws/audio")
async def websocket_audio_stream(websocket: WebSocket):
    """
    WebSocket endpoint for streaming audio transcription.
    
    Protocol:
    1. Client sends config JSON: {"sample_rate": 16000, "device_id": "..."}
    2. Client sends binary PCM chunks (Int16)
    3. Client sends "EOF" string when done
    4. Server sends {"status": "processing"} keep-alive during transcription
    5. Server responds with {"text": "...", "id": "..."}
    """
    await websocket.accept()
    
    storage = get_storage_service()
    settings = get_settings()
    manager = get_pipeline_manager()
    
    pcm_buffer = bytearray()
    sample_rate: int = 16000
    device_id: str = "unknown"
    start_time: float = 0
    client_connected = True
    
    async def send_keepalive():
        """Send periodic keep-alive messages during processing."""
        nonlocal client_connected
        while client_connected:
            try:
                await websocket.send_json({"status": "processing"})
                await asyncio.sleep(1)
            except Exception:
                client_connected = False
                break
    
    try:
        # Step 1: Receive config
        config_data = await websocket.receive_text()
        config = json.loads(config_data)
        sample_rate = config.get("sample_rate", 16000)
        device_id = config.get("device_id", "unknown")
        
        start_time = time.time()
        
        # Step 2: Receive PCM chunks until EOF or disconnect
        while True:
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                client_connected = False
                return
            
            # Check for disconnect message type
            if message.get("type") == "websocket.disconnect":
                client_connected = False
                return
            
            if "text" in message:
                text_data = message["text"]
                if text_data == "EOF":
                    break
            elif "bytes" in message:
                pcm_buffer.extend(message["bytes"])
        
        # Step 3: Check audio length
        if len(pcm_buffer) < 100:
            if client_connected:
                await websocket.send_json({"error": "Audio too short", "text": "", "id": ""})
            return
        
        # Step 4: Start keep-alive and transcribe
        wav_data = pcm_to_wav(bytes(pcm_buffer), sample_rate)
        pipe = manager.get_pipeline(settings.default_pipeline)
        
        # Start keep-alive task
        keepalive_task = asyncio.create_task(send_keepalive())
        
        try:
            transcription = await pipe.transcribe(wav_data, filename="stream.wav")
        finally:
            # Stop keep-alive
            client_connected = False
            keepalive_task.cancel()
            try:
                await keepalive_task
            except asyncio.CancelledError:
                pass
        
        end_time = time.time()
        latency_ms = int((end_time - start_time) * 1000)
        audio_duration_ms = int(len(pcm_buffer) / (sample_rate * 2) * 1000)
        
        # Step 5: Log interaction
        interaction_id = await storage.log_interaction(
            device_id=device_id,
            audio_duration_ms=audio_duration_ms,
            audio_format="pcm_s16le",
            raw_transcription=transcription,
            final_transcription=transcription,
            latency_ms=latency_ms,
        )
        
        # Step 6: Send result
        await websocket.send_json({
            "text": transcription,
            "id": interaction_id,
        })
        
    except WebSocketDisconnect:
        # Client disconnected - this is normal, don't treat as error
        pass
    except json.JSONDecodeError:
        try:
            await websocket.send_json({"error": "Invalid config JSON", "text": "", "id": ""})
        except Exception:
            pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e), "text": "", "id": ""})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
