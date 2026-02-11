"""Pipeline factory manager."""

from typing import Dict, Type
from functools import lru_cache

from app.services.pipelines.base import BasePipeline
from app.services.pipelines.raw_whisper import RawWhisperPipeline
from app.services.pipelines.whisper_fixer import WhisperFixerPipeline


# Registry of available pipelines
PIPELINE_REGISTRY: Dict[str, Type[BasePipeline]] = {
    "raw_whisper": RawWhisperPipeline,
    "whisper_fixer": WhisperFixerPipeline,
}


class PipelineManager:
    """
    Factory for creating and caching pipeline instances.
    
    Usage:
        manager = PipelineManager()
        pipeline = manager.get_pipeline("raw_whisper")
        text = await pipeline.transcribe(audio_bytes)
    """
    
    def __init__(self):
        self._instances: Dict[str, BasePipeline] = {}
    
    def get_pipeline(self, key: str = "raw_whisper") -> BasePipeline:
        """
        Get a pipeline instance by key.
        
        Args:
            key: Pipeline identifier (default: "raw_whisper").
            
        Returns:
            Pipeline instance.
            
        Raises:
            ValueError: If pipeline key not found.
        """
        if key not in PIPELINE_REGISTRY:
            available = ", ".join(PIPELINE_REGISTRY.keys())
            raise ValueError(f"Unknown pipeline '{key}'. Available: {available}")
        
        # Lazy instantiation with caching
        if key not in self._instances:
            self._instances[key] = PIPELINE_REGISTRY[key]()
        
        return self._instances[key]


@lru_cache
def get_pipeline_manager() -> PipelineManager:
    """Get singleton pipeline manager instance."""
    return PipelineManager()
