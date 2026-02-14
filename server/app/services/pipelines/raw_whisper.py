"""Whisper transcription step using Groq API."""

import io
import time
from typing import Optional, List, Dict, Any

from app.services.pipelines.base import PipelineStep, PipelineContext, GroqProvider, StepResult


class WhisperStep(PipelineStep):
    """
    Transcription step using Groq's Whisper-large-v3 model.
    
    Reads audio from context, writes raw transcription text
    to context as "raw_text".
    """
    
    MODEL = "whisper-large-v3-turbo"
    STEP_NAME = "whisper_large_v3"
    
    def __init__(self):
        self._provider = GroqProvider()
    
    async def process(self, ctx: PipelineContext) -> PipelineContext:
        """Transcribe audio bytes via Groq Whisper API."""
        client = self._provider.get_client(ctx.api_key)
        
        audio_file = io.BytesIO(ctx.audio_bytes)
        audio_file.name = ctx.filename
        
        api_kwargs = {
            "file": (ctx.filename, audio_file),
            "model": self.MODEL,
            "response_format": "text",
        }
        
        if ctx.prompt:
            api_kwargs["prompt"] = ctx.prompt
        
        if ctx.language:
            api_kwargs["language"] = ctx.language
        
        t0 = time.time()
        transcription = client.audio.transcriptions.create(**api_kwargs)
        latency_ms = int((time.time() - t0) * 1000)
        
        text = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
        
        # Write to context for downstream steps
        ctx.set_data("raw_text", text)
        ctx.set_data("whisper_latency_ms", latency_ms)
        ctx.results.append(StepResult(step=self.STEP_NAME, text=text, latency_ms=latency_ms))
        
        return ctx
