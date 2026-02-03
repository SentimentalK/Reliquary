"""Abstract base class for transcription pipelines."""

from abc import ABC, abstractmethod


class BasePipeline(ABC):
    """
    Abstract base class defining the pipeline interface.
    
    All transcription pipelines must implement the `transcribe` method.
    This enables the Strategy pattern for swapping implementations.
    """
    
    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        """
        Transcribe audio bytes to text.
        
        Args:
            audio_bytes: Raw audio data in bytes.
            filename: Original filename (used for format detection).
            
        Returns:
            Transcribed text string.
        """
        pass
