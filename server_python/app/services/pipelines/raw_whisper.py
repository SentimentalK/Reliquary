"""Raw Whisper pipeline using Groq API."""

import io
from groq import Groq

from app.config import get_settings
from app.services.pipelines.base import BasePipeline


class RawWhisperPipeline(BasePipeline):
    """
    Direct transcription using Groq's Whisper-large-v3 model.
    
    No prompt engineering or post-processing - returns raw transcription.
    """
    
    MODEL = "whisper-large-v3"
    
    def __init__(self):
        settings = get_settings()
        self.client = Groq(api_key=settings.groq_api_key)
    
    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        """
        Transcribe audio using Groq Whisper API.
        
        Args:
            audio_bytes: Raw audio data.
            filename: Filename for format detection.
            
        Returns:
            Raw transcription text.
        """
        # Create file-like object from bytes
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename
        
        # Call Groq API
        transcription = self.client.audio.transcriptions.create(
            file=(filename, audio_file),
            model=self.MODEL,
            response_format="text",
        )
        
        return transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
