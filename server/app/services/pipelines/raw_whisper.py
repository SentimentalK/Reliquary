"""Raw Whisper pipeline using Groq API."""

import io
import time
from typing import Optional, List, Dict, Any

from app.services.pipelines.base import BasePipeline, GroqProvider, StepResult


class RawWhisperPipeline(BasePipeline):
    """
    Direct transcription using Groq's Whisper-large-v3 model.
    
    Returns raw Whisper output without any post-processing.
    """
    
    MODEL = "whisper-large-v3"
    STEP_NAME = "whisper_large_v3"
    
    def __init__(self):
        self._provider = GroqProvider()
    
    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        api_key: Optional[str] = None,
        user_config: Optional[Dict[str, Any]] = None,
    ) -> List[StepResult]:
        """
        Transcribe audio using Groq Whisper API.
        
        Returns:
            List with single StepResult from Whisper (includes latency).
        """
        client = self._provider.get_client(api_key)
        
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename
        
        api_kwargs = {
            "file": (filename, audio_file),
            "model": self.MODEL,
            "response_format": "text",
        }
        
        if prompt:
            api_kwargs["prompt"] = prompt
        
        if language:
            api_kwargs["language"] = language
        
        t0 = time.time()
        transcription = client.audio.transcriptions.create(**api_kwargs)
        latency_ms = int((time.time() - t0) * 1000)
        
        text = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
        
        return [StepResult(step=self.STEP_NAME, text=text, latency_ms=latency_ms)]
