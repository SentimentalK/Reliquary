"""Generic Whisper + Fixer chain pipeline."""

from typing import Optional, List, Dict, Any

from app.services.pipelines.base import BasePipeline, StepResult
from app.services.pipelines.raw_whisper import RawWhisperPipeline
from app.services.pipelines.fixers.base import BaseFixer


class WhisperFixerPipeline(BasePipeline):
    """
    Chain pipeline: Whisper transcription → LLM fixer.
    
    The fixer is passed as a constructor parameter, making this pipeline
    reusable for any language (Chinese, English, etc.).
    """
    
    def __init__(self, fixer: BaseFixer):
        self._whisper = RawWhisperPipeline()
        self._fixer = fixer
    
    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        api_key: Optional[str] = None,
        user_config: Optional[Dict[str, Any]] = None,
    ) -> List[StepResult]:
        """
        Transcribe audio and fix the result.
        
        Args:
            user_config: Per-step config, e.g.
                {"chinese_fixer": {"keywords": [...], "user_prompt": "..."}}
        
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
        
        # Extract user config for this fixer step
        step_cfg = (user_config or {}).get(self._fixer.STEP_NAME, {})
        keywords = step_cfg.get("keywords")
        user_prompt = step_cfg.get("user_prompt")
        
        fixed_text, fixer_latency = await self._fixer.fix(
            raw_text,
            api_key=api_key,
            keywords=keywords,
            user_prompt=user_prompt,
        )
        results.append(StepResult(
            step=self._fixer.STEP_NAME,
            text=fixed_text,
            latency_ms=fixer_latency,
        ))
        
        return results
