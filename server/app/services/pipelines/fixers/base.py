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
    
    async def fix(
        self,
        raw_text: str,
        api_key: Optional[str] = None,
        keywords: Optional[list[str]] = None,
        user_prompt: Optional[str] = None,
    ) -> tuple[str, int]:
        """
        Fix raw ASR text using LLM.
        
        Args:
            raw_text: Raw transcription from previous step.
            api_key: API key for BYOK authentication.
            keywords: User-defined keywords that must be recognized correctly.
            user_prompt: User-defined additional correction rules.
            
        Returns:
            Tuple of (corrected_text, latency_ms).
        """
        if not raw_text or not raw_text.strip():
            return raw_text, 0
        
        # Build system prompt: base + user keywords + user prompt
        system_prompt = self.SYSTEM_PROMPT
        
        if keywords:
            kw_str = ", ".join(keywords[:10])
            system_prompt += f"\n\n# 用户关键词（这些词必须正确识别）\n{kw_str}"
        
        if user_prompt and user_prompt.strip():
            system_prompt += f"\n\n# 用户补充规则（次优先级）\n{user_prompt.strip()}"
        
        client = self._provider.get_client(api_key)
        
        t0 = time.time()
        response = client.chat.completions.create(
            model=self.MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
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
