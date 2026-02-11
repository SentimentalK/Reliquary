"""Whisper + Chinese Fixer chain pipeline."""

from typing import Optional, List

from app.services.pipelines.base import BasePipeline, StepResult
from app.services.pipelines.raw_whisper import RawWhisperPipeline
from app.services.pipelines.fixers import ChineseFixer


class WhisperFixerPipeline(BasePipeline):
    """
    Chain pipeline: Whisper transcription → Chinese LLM fixer.
    
    All intermediate step results (with latency) are collected and returned.
    """
    
    def __init__(self):
        self._whisper = RawWhisperPipeline()
        self._fixer = ChineseFixer()
    
    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> List[StepResult]:
        """
        Transcribe audio and fix the result.
        
        Returns:
            Ordered list: [whisper_result, fixer_result] with per-step latency.
        """
        # Step 1: Whisper transcription
        results = await self._whisper.transcribe(
            audio_bytes=audio_bytes,
            filename=filename,
            language=language,
            prompt=prompt,
            api_key=api_key,
        )
        
        # Step 2: LLM fixer (input = last step's text)
        raw_text = results[-1].text
        fixed_text, fixer_latency = await self._fixer.fix(raw_text, api_key=api_key)
        results.append(StepResult(
            step=self._fixer.STEP_NAME,
            text=fixed_text,
            latency_ms=fixer_latency,
        ))
        
        return results
