"""Storage service for logging interactions to JSONL files.

Supports multi-user distributed storage with path structure:
{STORAGE_ROOT}/{user_id}/{YYYY-MM-DD}_{device_id}.jsonl
"""

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
import aiofiles

from app.config import get_settings


def sanitize_filename(name: str) -> str:
    """
    Sanitize a string to be safe for use in filenames.
    
    Removes unsafe characters like / \ : * ? " < > |
    and replaces spaces with underscores.
    """
    # Remove or replace unsafe characters
    sanitized = re.sub(r'[/\\:*?"<>|]', '', name)
    # Replace spaces and multiple underscores
    sanitized = re.sub(r'\s+', '_', sanitized)
    sanitized = re.sub(r'_+', '_', sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip('_')
    # Fallback if completely empty
    return sanitized if sanitized else "unknown"


class StorageService:
    """Async JSONL logging service for multi-user interaction data."""
    
    def __init__(self, storage_root: Optional[str] = None):
        """
        Initialize storage service.
        
        Args:
            storage_root: Root path for all logs. If None, uses config value.
        """
        settings = get_settings()
        root = storage_root or settings.storage_root
        # Resolve to absolute path
        self.storage_root = Path(root).resolve()
    
    def _get_user_dir(self, user_id: str) -> Path:
        """Get the directory for a specific user."""
        safe_user_id = sanitize_filename(user_id)
        return self.storage_root / safe_user_id
    
    def _get_log_path(self, user_id: str, device_id: str) -> Path:
        """
        Get the log file path for a user and device.
        
        Path format: {STORAGE_ROOT}/{user_id}/{YYYY-MM-DD}_{device_id}.jsonl
        """
        user_dir = self._get_user_dir(user_id)
        date_str = datetime.now().strftime("%Y-%m-%d")
        safe_device_id = sanitize_filename(device_id)
        filename = f"{date_str}_{safe_device_id}.jsonl"
        return user_dir / filename
    
    async def log_interaction(
        self,
        user_id: str,
        device_id: str,
        audio_duration_ms: int,
        audio_format: str,
        raw_transcription: str,
        final_transcription: str,
        latency_ms: int,
    ) -> str:
        """
        Log an interaction to the user's JSONL file.
        
        Args:
            user_id: User identifier for directory routing
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
            "user_id": user_id,
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
        
        # Get log path and ensure user directory exists
        log_path = self._get_log_path(user_id, device_id)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write asynchronously (append mode)
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
