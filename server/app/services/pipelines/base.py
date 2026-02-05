"""Abstract base class for transcription pipelines."""

from abc import ABC, abstractmethod
from typing import Optional


class BasePipeline(ABC):
    """
    Abstract base class defining the pipeline interface.
    
    All transcription pipelines must implement the `transcribe` method.
    This enables the Strategy pattern for swapping implementations.
    Supports BYOK (Bring Your Own Key) via optional api_key parameter.
    """
    
    @abstractmethod
    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> str:
        """
        Transcribe audio bytes to text.
        
        Args:
            audio_bytes: Raw audio data in bytes.
            filename: Original filename (used for format detection).
            language: Optional language code (e.g., "en", "zh").
            prompt: Optional custom prompt for recognition.
            api_key: Optional API key override (BYOK - Bring Your Own Key).
            
        Returns:
            Transcribed text string.
        """
        pass

