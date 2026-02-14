"""Pipeline base abstractions: PipelineStep, PipelineContext, and utilities."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from groq import Groq


@dataclass
class StepResult:
    """Result from a single pipeline step."""
    step: str        # e.g. "whisper_large_v3", "chinese_fixer"
    text: str        # output text of this step
    latency_ms: int  # time taken for this step in milliseconds


class PipelineContext:
    """
    Shared context bag flowing through pipeline steps.
    
    Each step reads what it needs from the context, writes its output
    back, and appends a StepResult. Steps are decoupled — they don't
    know who produced the data they consume.
    """
    
    def __init__(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        api_key: Optional[str] = None,
        user_config: Optional[Dict[str, Any]] = None,
    ):
        self.audio_bytes = audio_bytes
        self.filename = filename
        self.language = language
        self.prompt = prompt
        self.api_key = api_key
        self.user_config = user_config or {}
        self.results: List[StepResult] = []
        self._data: Dict[str, Any] = {}
    
    def set_data(self, key: str, value: Any) -> None:
        """Store a value for downstream steps."""
        self._data[key] = value
    
    def get_data(self, key: str, default: Any = None) -> Any:
        """Retrieve a value set by an upstream step."""
        return self._data.get(key, default)


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


class PipelineStep(ABC):
    """
    Abstract base class for a single pipeline step.
    
    Each step reads from and writes to a PipelineContext.
    Steps are composable "building blocks" — they don't know
    who runs before or after them.
    """
    
    STEP_NAME: str = ""  # Unique identifier, e.g. "whisper_large_v3"
    
    @abstractmethod
    async def process(self, ctx: PipelineContext) -> PipelineContext:
        """
        Process the context and return it (possibly mutated).
        
        Implementations should:
        1. Read input from ctx (get_data / attributes)
        2. Do their work
        3. Write output to ctx (set_data) and append StepResult
        4. Return ctx
        """
        pass
