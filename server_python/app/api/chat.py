"""Transcription API endpoints."""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import PlainTextResponse

from app.config import get_settings
from app.services.pipelines.manager import get_pipeline_manager

router = APIRouter()


@router.post("/transcribe", response_class=PlainTextResponse)
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    pipeline: str = Query(None, description="Pipeline to use (default: from config)")
) -> str:
    """
    Transcribe uploaded audio file to text.
    
    - **file**: Audio file (WAV, MP3, etc.)
    - **pipeline**: Optional pipeline key (default: "raw")
    
    Returns plain text transcription.
    """
    settings = get_settings()
    pipeline_key = pipeline or settings.default_pipeline
    
    try:
        # Read audio bytes
        audio_bytes = await file.read()
        
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
        # Get pipeline and transcribe
        manager = get_pipeline_manager()
        pipe = manager.get_pipeline(pipeline_key)
        
        text = await pipe.transcribe(audio_bytes, filename=file.filename or "audio.wav")
        
        return text
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
