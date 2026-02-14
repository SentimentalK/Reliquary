"""Pipeline manager with config-driven step assembly."""

from typing import Any, Dict, List, Type
from functools import lru_cache

from app.services.pipelines.base import PipelineStep, PipelineContext, StepResult
from app.services.pipelines.raw_whisper import WhisperStep
from app.services.pipelines.fixers import LLMFixerStep


# ---------------------------------------------------------------------------
# Step Configs — maps step names to their class + constructor args
# Adding a new fixer = one new entry here + one prompt file.  No code needed.
# ---------------------------------------------------------------------------
STEP_CONFIGS: Dict[str, Dict[str, Any]] = {
    "whisper": {
        "class": WhisperStep,
    },
    "chinese_fixer_kimi-k2": {
        "class": LLMFixerStep,
        "args": {
            "step_name": "chinese_fixer_kimi-k2",
            "model": "moonshotai/kimi-k2-instruct-0905",
            "prompt_key": "chinese_fixer",
        },
    },
    "chinese_fixer_gpt-oss-20b": {
        "class": LLMFixerStep,
        "args": {
            "step_name": "chinese_fixer_gpt-oss-20b",
            "model": "openai/gpt-oss-20b",
            "prompt_key": "chinese_fixer",
            "token_buffer": 1024,
            "min_latency_ms": 2000,
        },
    },
    "chinese_fixer_qwen3-32b": {
        "class": LLMFixerStep,
        "args": {
            "step_name": "chinese_fixer_qwen3-32b",
            "model": "qwen/qwen3-32b",
            "prompt_key": "chinese_fixer",
            "strip_pattern": r"<think>.*?</think>\s*",
            "token_ratio": 3.0,
            "token_buffer": 1024,
            "min_latency_ms": 3000,
        },
    },
    "english_fixer": {
        "class": LLMFixerStep,
        "args": {
            "step_name": "english_fixer",
            "model": "llama-3.1-8b-instant",
            "prompt_key": "english_fixer",
        },
    },
}

# ---------------------------------------------------------------------------
# Pipeline Templates — maps pipeline keys to ordered lists of step names
# Adding a new pipeline = one new entry here.
# ---------------------------------------------------------------------------
PIPELINE_TEMPLATES: Dict[str, List[str]] = {
    "raw_whisper": ["whisper"],
    "whisper_chinese_fixer_kimi-k2": ["whisper", "chinese_fixer_kimi-k2"],
    "whisper_chinese_fixer_gpt-oss-20b": ["whisper", "chinese_fixer_gpt-oss-20b"],
    "whisper_chinese_fixer_qwen3-32b": ["whisper", "chinese_fixer_qwen3-32b"],
    "whisper_english_fixer": ["whisper", "english_fixer"],
}


class PipelineManager:
    """
    Config-driven pipeline assembly and execution.
    
    Instantiates steps from STEP_CONFIGS according to PIPELINE_TEMPLATES,
    runs them sequentially through a shared PipelineContext, and returns
    the accumulated StepResults + final text.
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
    
    def get_step_config(self, step_name: str) -> Dict[str, Any]:
        """Return the config dict for a given step name."""
        if step_name not in STEP_CONFIGS:
            raise ValueError(f"Unknown step '{step_name}'")
        return STEP_CONFIGS[step_name]
    
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
        
        Returns:
            Tuple of (step_results, final_text).
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
            cfg = STEP_CONFIGS[step_name]
            step = cfg["class"](**cfg.get("args", {}))
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
