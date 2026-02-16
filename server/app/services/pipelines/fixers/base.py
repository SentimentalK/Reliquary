"""Config-driven LLM fixer step (replaces ChineseFixerStep / EnglishFixerStep)."""

import re
import time
from typing import Optional, Pattern

from app.services.pipelines.base import PipelineStep, PipelineContext, GroqProvider, StepResult
from app.services.prompt_service import get_prompt_service


class LLMFixerStep(PipelineStep):
    """
    Config-driven LLM fixer step.
    
    Instantiated with (step_name, model, prompt_key) — no subclassing needed.
    Reads "raw_text" from context, fixes it via LLM, writes back.
    Prompt text is loaded from disk via PromptService.
    """
    
    def __init__(
        self, 
        step_name: str, 
        model: str, 
        prompt_key: str,
        # --- Configurable parameters ---
        strip_pattern: Optional[str] = None, # Regex pattern to strip from output
        token_ratio: float = 2.0,            # Max output tokens = input length * ratio
        token_buffer: int = 200,             # Base token buffer (safety margin)
        latency_factor: float = 2.0,         # Latency threshold multiplier vs Whisper
        min_latency_ms: int = 1500,          # Minimum latency threshold in ms
        frequency_penalty: float = 0.0,      # Frequency penalty for LLM
    ):
        self.STEP_NAME = step_name
        self.model = model
        self.prompt_key = prompt_key
        
        # Pre-compile regex if provided
        self.strip_re: Optional[Pattern] = re.compile(strip_pattern, re.DOTALL) if strip_pattern else None
        
        self.token_ratio = token_ratio
        self.token_buffer = token_buffer
        self.latency_factor = latency_factor
        self.min_latency_ms = min_latency_ms
        self.frequency_penalty = frequency_penalty
        
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
        
        # Dynamic max_tokens calculation
        # Reasoning models need large buffer for "thinking"
        max_tokens = int(len(raw_text) * self.token_ratio) + self.token_buffer
        
        # Load versioned prompt from disk
        system_prompt = self._prompt_service.get_prompt(self.prompt_key)
        prompt_ver = self._prompt_service.get_prompt_version(self.prompt_key)
        
        # Record prompt version in context for transaction log
        prompt_versions = ctx.get_data("prompt_versions", {})
        prompt_versions[self.STEP_NAME] = prompt_ver
        ctx.set_data("prompt_versions", prompt_versions)
        
        try:
            fixed_text, latency_ms = await self._fix(
                raw_text,
                system_prompt=system_prompt,
                api_key=ctx.api_key,
                keywords=keywords,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
                frequency_penalty=self.frequency_penalty
            )
        except Exception as e:
            print(f"[Fixer] Error in step {self.STEP_NAME}: {e}. Fallback to raw.")
            ctx.set_data("use_raw_fallback", True)
            # Add a dummy result so pipeline logic doesn't break if it expects a result
            ctx.results.append(StepResult(step=self.STEP_NAME, text=raw_text, latency_ms=0))
            return ctx
        
        # Latency circuit breaker
        whisper_latency = ctx.get_data("whisper_latency_ms", 0)
        
        # Only break if latency exceeds BOTH relative factor AND absolute minimum
        threshold = max(whisper_latency * self.latency_factor, self.min_latency_ms)
        
        if whisper_latency > 0 and latency_ms > threshold:
            print(f"[Fixer] Latency breaker: {self.STEP_NAME} took {latency_ms}ms "
                  f"> limit {threshold}ms (whisper={whisper_latency}ms). Fallback.")
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
        frequency_penalty: float = 0.0,
    ) -> tuple[str, int]:
        """
        Internal fix logic — LLM chat completion with timing and optional regex stripping.
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
        
        if frequency_penalty > 0:
            api_kwargs["frequency_penalty"] = frequency_penalty
        
        t0 = time.time()
        response = client.chat.completions.create(**api_kwargs)
        latency_ms = int((time.time() - t0) * 1000)
        
        result = response.choices[0].message.content
        if not result:
            return raw_text, latency_ms
        
        # Apply regex stripping if configured (e.g. remove <think> tags)
        if self.strip_re:
            result = self.strip_re.sub("", result)
            
        return result.strip() if result.strip() else raw_text, latency_ms
