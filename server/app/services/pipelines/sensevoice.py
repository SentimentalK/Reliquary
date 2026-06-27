"""SenseVoice transcription step using local self-hosted API."""

import time
import httpx
from typing import Optional, List, Dict, Any

from app.services.pipelines.base import PipelineStep, PipelineContext, StepResult
from app.config import get_settings


class SenseVoiceStep(PipelineStep):
    """
    Transcription step using self-hosted SenseVoice-API service.
    
    Reads audio from context, writes raw transcription text
    to context as "raw_text".
    """
    
    STEP_NAME = "sensevoice"
    
    async def process(self, ctx: PipelineContext) -> PipelineContext:
        """Transcribe audio bytes via local SenseVoice service."""
        settings = get_settings()
        api_url = settings.sensevoice_api_url
        
        if not api_url:
            raise ValueError("SenseVoice API URL is not configured.")
            
        t0 = time.time()
        
        # Prepare file payload
        files = {
            "file": (ctx.filename, ctx.audio_bytes, "audio/wav")
        }
        data = {}
        if ctx.language:
            data["language"] = ctx.language
            
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{api_url}/transcribe",
                    files=files,
                    data=data
                )
                
            latency_ms = int((time.time() - t0) * 1000)
            
            if response.status_code != 200:
                raise Exception(f"SenseVoice API returned {response.status_code}: {response.text}")
                
            res_data = response.json()
            text = res_data.get("text", "").strip()
            
        except Exception as e:
            raise Exception(f"SenseVoice API request failed: {str(e)}")
            
        # Write to context for downstream steps (like LLM fixers)
        ctx.set_data("raw_text", text)
        ctx.set_data("sensevoice_latency_ms", latency_ms)
        ctx.results.append(StepResult(step=self.STEP_NAME, text=text, latency_ms=latency_ms))
        
        return ctx
