"""Config-driven LLM fixer step (replaces ChineseFixerStep / EnglishFixerStep)."""

import re
import time
from typing import Optional

from app.services.pipelines.base import PipelineStep, PipelineContext, GroqProvider, StepResult
from app.services.prompt_service import get_prompt_service

# Regex to strip <think>...</think> blocks from Qwen3 output
_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)


class LLMFixerStep(PipelineStep):
    """
    Config-driven LLM fixer step.
    
    Instantiated with (step_name, model, prompt_key) — no subclassing needed.
    Reads "raw_text" from context, fixes it via LLM, writes back.
    Prompt text is loaded from disk via PromptService.
    """
    
    def __init__(self, step_name: str, model: str, prompt_key: str):
        self.STEP_NAME = step_name
        self.model = model
        self.prompt_key = prompt_key
        self._provider = GroqProvider()
        self._prompt_service = get_prompt_service()
    
    async def process(self, ctx: PipelineContext) -> PipelineContext:
        """Fix raw ASR text using LLM, reading/writing from context."""
        raw_text = ctx.get_data("raw_text", "")
        
        if not raw_text or not raw_text.strip():
            ctx.results.append(StepResult(step=self.STEP_NAME, text=raw_text, latency_ms=0))
            return ctx
        
        # Extract per-step user config (keywords, user_prompt)
        step_cfg = ctx.user_config.get(self.STEP_NAME, {})
        keywords = step_cfg.get("keywords")
        user_prompt = step_cfg.get("user_prompt")
        
        # Anti-hallucination: cap output tokens at 2x raw text length
        max_tokens = len(raw_text) * 2
        
        # Load versioned prompt from disk
        system_prompt = self._prompt_service.get_prompt(self.prompt_key)
        prompt_ver = self._prompt_service.get_prompt_version(self.prompt_key)
        
        # Record prompt version in context for transaction log
        prompt_versions = ctx.get_data("prompt_versions", {})
        prompt_versions[self.STEP_NAME] = prompt_ver
        ctx.set_data("prompt_versions", prompt_versions)
        
        fixed_text, latency_ms = await self._fix(
            raw_text,
            system_prompt=system_prompt,
            api_key=ctx.api_key,
            keywords=keywords,
            user_prompt=user_prompt,
            max_tokens=max_tokens
        )
        
        # Latency circuit breaker: if fixer took longer than Whisper * 1.5,
        # keep fixer result in the log but signal manager to return raw text.
        whisper_latency = ctx.get_data("whisper_latency_ms", 0)
        if whisper_latency > 0 and latency_ms > whisper_latency * 1.5:
            print(f"[Fixer] Latency breaker: {self.STEP_NAME} took {latency_ms}ms "
                  f"> whisper {whisper_latency}ms, falling back to raw text")
            ctx.set_data("use_raw_fallback", True)
        else:
            ctx.set_data("raw_text", fixed_text)
        
        # Fixer result always stored for logging
        ctx.results.append(StepResult(step=self.STEP_NAME, text=fixed_text, latency_ms=latency_ms))
        
        return ctx
    
    async def _fix(
        self,
        raw_text: str,
        system_prompt: str,
        api_key: Optional[str] = None,
        keywords: Optional[list[str]] = None,
        user_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> tuple[str, int]:
        """
        Internal fix logic — LLM chat completion with timing and <think> stripping.
        
        Args:
            system_prompt: Base system prompt loaded from PromptService.
            max_tokens: Cap on output tokens (anti-hallucination guard).
        
        Returns:
            Tuple of (corrected_text, latency_ms).
        """
        # Build system prompt: base + user keywords + user prompt
        if keywords:
            kw_str = ", ".join(keywords[:10])
            system_prompt += f"\n\n# 用户关键词（这些词必须正确识别）\n{kw_str}"
        
        if user_prompt and user_prompt.strip():
            system_prompt += f"\n\n# 用户补充规则（次优先级）\n{user_prompt.strip()}"
        
        client = self._provider.get_client(api_key)
        
        api_kwargs = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": raw_text},
            ]
        }
        if max_tokens and max_tokens > 0:
            api_kwargs["max_tokens"] = max_tokens
        
        t0 = time.time()
        response = client.chat.completions.create(**api_kwargs)
        latency_ms = int((time.time() - t0) * 1000)
        
        result = response.choices[0].message.content
        if not result:
            return raw_text, latency_ms
        
        # Strip <think>...</think> blocks from Qwen3 output
        result = _THINK_RE.sub("", result)
        return result.strip() if result.strip() else raw_text, latency_ms
