"""Storage service for logging interactions to JSONL files."""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
import asyncio
import aiofiles


class StorageService:
    """Async JSONL logging service for interaction data."""
    
    def __init__(self, base_dir: str = "data/logs"):
        self.base_dir = Path(base_dir)
    
    def _ensure_dir(self) -> None:
        """Ensure the log directory exists."""
        self.base_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_log_path(self) -> Path:
        """Get today's log file path."""
        date_str = datetime.now().strftime("%Y-%m-%d")
        return self.base_dir / f"{date_str}.jsonl"
    
    async def log_interaction(
        self,
        device_id: str,
        audio_duration_ms: int,
        audio_format: str,
        raw_transcription: str,
        final_transcription: str,
        latency_ms: int,
    ) -> str:
        """
        Log an interaction to the daily JSONL file.
        
        Args:
            device_id: Client-provided device identifier
            audio_duration_ms: Duration of audio in milliseconds
            audio_format: Audio format (e.g., "pcm_s16le")
            raw_transcription: Raw text from Whisper
            final_transcription: Final text (after any processing)
            latency_ms: Total processing latency
            
        Returns:
            Generated interaction ID
        """
        interaction_id = str(uuid.uuid4())
        
        data = {
            "id": interaction_id,
            "timestamp": datetime.now().isoformat(),
            "device_id": device_id,
            "audio_meta": {
                "duration_ms": audio_duration_ms,
                "format": audio_format,
            },
            "transcription": {
                "raw": raw_transcription,
                "final": final_transcription,
            },
            "latency_ms": latency_ms,
        }
        
        # Ensure directory exists (sync operation, but fast)
        self._ensure_dir()
        
        # Write asynchronously
        log_path = self._get_log_path()
        json_line = json.dumps(data, ensure_ascii=False) + "\n"
        
        async with aiofiles.open(log_path, mode="a", encoding="utf-8") as f:
            await f.write(json_line)
        
        return interaction_id


# Singleton instance
_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """Get the singleton storage service instance."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
