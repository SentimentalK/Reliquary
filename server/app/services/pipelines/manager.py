"""Pipeline factory manager."""

from typing import Dict, Type
from functools import lru_cache

from app.services.pipelines.base import BasePipeline
from app.services.pipelines.raw_whisper import RawWhisperPipeline


# Registry of available pipelines
PIPELINE_REGISTRY: Dict[str, Type[BasePipeline]] = {
    "raw": RawWhisperPipeline,
    "raw_whisper": RawWhisperPipeline,
    "geo_reliquary_v1": RawWhisperPipeline, # TODO: Implement actual specialized pipeline
    # Future pipelines can be added here:
    # "hotword": HotWordCorrectionPipeline,
    # "summarize": SummarizationPipeline,
}


class PipelineManager:
    """
    Factory for creating and caching pipeline instances.
    
    Usage:
        manager = PipelineManager()
        pipeline = manager.get_pipeline("raw")
        text = await pipeline.transcribe(audio_bytes)
    """
    
    def __init__(self):
        self._instances: Dict[str, BasePipeline] = {}
    
    def get_pipeline(self, key: str = "raw") -> BasePipeline:
        """
        Get a pipeline instance by key.
        
        Args:
            key: Pipeline identifier (default: "raw").
            
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
