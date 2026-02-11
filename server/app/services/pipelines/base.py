"""Base pipeline interface and API provider utilities."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

from groq import Groq


@dataclass
class StepResult:
    """Result from a single pipeline step."""
    step: str        # e.g. "whisper_large_v3", "chinese_fixer"
    text: str        # output text of this step
    latency_ms: int  # time taken for this step in milliseconds


class GroqProvider:
    """
    Utility class for GROQ API access.
    
    Handles client creation with BYOK (Bring Your Own Key).
    Future providers (OpenAI, etc.) can follow the same pattern.
    """
    
    def get_client(self, api_key: Optional[str] = None) -> Groq:
        """
        Get a Groq client with the specified API key (Strict BYOK).
        
        Raises:
            ValueError: If no API key is provided.
        """
        if not api_key:
            raise ValueError("Authentication error: valid API Key required (BYOK).")
        return Groq(api_key=api_key)


class BasePipeline(ABC):
    """
    Abstract base class defining the pipeline interface.
    
    All transcription pipelines must implement the `transcribe` method.
    Returns an ordered list of StepResult for every step in the pipeline.
    """
    
    @abstractmethod
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
        Transcribe audio bytes to text.
        
        Args:
            user_config: Per-step user config dict, e.g.
                {"chinese_fixer": {"keywords": [...], "user_prompt": "..."}}
        
        Returns:
            Ordered list of StepResult, one per pipeline step.
            Each StepResult includes step name, text output, and latency.
        """
        pass
