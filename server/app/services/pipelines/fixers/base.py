"""Base class for LLM-based fixer steps."""

import re
import time
from abc import ABC
from typing import Optional

from app.services.pipelines.base import GroqProvider

# Regex to strip <think>...</think> blocks from Qwen3 output
_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)


class BaseFixer(ABC):
    """
    Base class for LLM-based ASR correction steps.
    
    Subclasses define their own MODEL, STEP_NAME, and SYSTEM_PROMPT.
    The fix() method handles the GROQ chat completion call,
    timing, and <think> tag stripping.
    """
    
    MODEL: str = ""           # e.g. "qwen/qwen3-32b"
    STEP_NAME: str = ""       # e.g. "chinese_fixer"
    SYSTEM_PROMPT: str = ""   # System prompt for correction
    
    def __init__(self):
        self._provider = GroqProvider()
    
    async def fix(self, raw_text: str, api_key: Optional[str] = None) -> tuple[str, int]:
        """
        Fix raw ASR text using LLM.
        
        Args:
            raw_text: Raw transcription from previous step.
            api_key: API key for BYOK authentication.
            
        Returns:
            Tuple of (corrected_text, latency_ms).
        """
        if not raw_text or not raw_text.strip():
            return raw_text, 0
        
        client = self._provider.get_client(api_key)
        
        t0 = time.time()
        response = client.chat.completions.create(
            model=self.MODEL,
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": raw_text},
            ],
        )
        latency_ms = int((time.time() - t0) * 1000)
        
        result = response.choices[0].message.content
        if not result:
            return raw_text, latency_ms
        
        # Strip <think>...</think> blocks from Qwen3 output
        result = _THINK_RE.sub("", result)
        return result.strip() if result.strip() else raw_text, latency_ms
