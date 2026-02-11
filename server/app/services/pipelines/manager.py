"""Pipeline factory manager."""

from typing import Dict
from functools import lru_cache

from app.services.pipelines.base import BasePipeline
from app.services.pipelines.raw_whisper import RawWhisperPipeline
from app.services.pipelines.whisper_fixer import WhisperFixerPipeline
from app.services.pipelines.fixers import ChineseFixer, EnglishFixer


# Registry of available pipelines (pre-built instances)
PIPELINE_REGISTRY: Dict[str, BasePipeline] = {
    "raw_whisper": RawWhisperPipeline(),
    "whisper_chinese_fixer": WhisperFixerPipeline(ChineseFixer()),
    "whisper_english_fixer": WhisperFixerPipeline(EnglishFixer()),
}


class PipelineManager:
    """
    Pipeline lookup from registry.
    
    Usage:
        manager = PipelineManager()
        pipeline = manager.get_pipeline("raw_whisper")
        results = await pipeline.transcribe(audio_bytes)
    """
    
    def get_pipeline(self, key: str = "raw_whisper") -> BasePipeline:
        """Get a pipeline instance by key."""
        if key not in PIPELINE_REGISTRY:
            available = ", ".join(PIPELINE_REGISTRY.keys())
            raise ValueError(f"Unknown pipeline '{key}'. Available: {available}")
        return PIPELINE_REGISTRY[key]


@lru_cache
def get_pipeline_manager() -> PipelineManager:
    """Get singleton pipeline manager instance."""
    return PipelineManager()

