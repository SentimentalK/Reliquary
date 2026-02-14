"""Pipeline manager with dynamic step assembly."""

from typing import Dict, List, Type
from functools import lru_cache

from app.services.pipelines.base import PipelineStep, PipelineContext, StepResult
from app.services.pipelines.raw_whisper import WhisperStep
from app.services.pipelines.fixers import ChineseFixerStep, EnglishFixerStep


# ---------------------------------------------------------------------------
# Step Registry — maps step names to their classes (the "building blocks")
# ---------------------------------------------------------------------------
STEP_REGISTRY: Dict[str, Type[PipelineStep]] = {
    "whisper": WhisperStep,
    "chinese_fixer": ChineseFixerStep,
    "english_fixer": EnglishFixerStep,
}

# ---------------------------------------------------------------------------
# Pipeline Templates — maps pipeline keys to ordered lists of step names
# Adding a new pipeline = one new entry here.  No code changes needed.
# ---------------------------------------------------------------------------
PIPELINE_TEMPLATES: Dict[str, List[str]] = {
    "raw_whisper": ["whisper"],
    "whisper_chinese_fixer": ["whisper", "chinese_fixer"],
    "whisper_english_fixer": ["whisper", "english_fixer"],
}


class PipelineManager:
    """
    Dynamic pipeline assembly and execution.
    
    Instantiates steps from STEP_REGISTRY according to PIPELINE_TEMPLATES,
    runs them sequentially through a shared PipelineContext, and returns
    the accumulated StepResults.
    
    Usage:
        manager = PipelineManager()
        results = await manager.run("whisper_chinese_fixer", audio_bytes, ...)
    """
    
    def get_available_pipelines(self) -> List[str]:
        """Return all registered pipeline keys."""
        return list(PIPELINE_TEMPLATES.keys())
    
    def get_pipeline_steps(self, pipeline_key: str) -> List[str]:
        """Return ordered step names for a pipeline key."""
        if pipeline_key not in PIPELINE_TEMPLATES:
            available = ", ".join(PIPELINE_TEMPLATES.keys())
            raise ValueError(f"Unknown pipeline '{pipeline_key}'. Available: {available}")
        return PIPELINE_TEMPLATES[pipeline_key]
    
    def get_step_class(self, step_name: str) -> Type[PipelineStep]:
        """Return the step class for a given step name."""
        if step_name not in STEP_REGISTRY:
            raise ValueError(f"Unknown step '{step_name}'")
        return STEP_REGISTRY[step_name]
    
    async def run(
        self,
        pipeline_key: str,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: str | None = None,
        prompt: str | None = None,
        api_key: str | None = None,
        user_config: dict | None = None,
    ) -> tuple[List[StepResult], str]:
        """
        Assemble and run a pipeline by key.
        
        Args:
            pipeline_key: Key from PIPELINE_TEMPLATES (e.g. "whisper_chinese_fixer").
            audio_bytes: Raw audio data.
            filename: Audio filename hint.
            language: Language hint for Whisper.
            prompt: Prompt hint for Whisper.
            api_key: BYOK API key.
            user_config: Per-step config dict, e.g.
                {"chinese_fixer": {"keywords": [...], "user_prompt": "..."}}
        
        Returns:
            Tuple of (step_results, final_text).
            step_results: full list for logging.
            final_text: the text to return to the user (may differ from
                        results[-1] if the latency breaker fired).
        """
        step_names = self.get_pipeline_steps(pipeline_key)
        
        ctx = PipelineContext(
            audio_bytes=audio_bytes,
            filename=filename,
            language=language,
            prompt=prompt,
            api_key=api_key,
            user_config=user_config,
        )
        
        for step_name in step_names:
            step_cls = STEP_REGISTRY[step_name]
            step = step_cls()
            ctx = await step.process(ctx)
        
        # Determine final text for the user
        if ctx.get_data("use_raw_fallback"):
            # Latency breaker fired — return whisper raw text
            whisper_result = next((r for r in ctx.results if r.step == WhisperStep.STEP_NAME), None)
            final_text = whisper_result.text if whisper_result else (ctx.results[-1].text if ctx.results else "")
        else:
            final_text = ctx.results[-1].text if ctx.results else ""
        
        return ctx.results, final_text


@lru_cache
def get_pipeline_manager() -> PipelineManager:
    """Get singleton pipeline manager instance."""
    return PipelineManager()
