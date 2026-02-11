"""Storage service for logging interactions to JSONL files.

Supports multi-user distributed storage with path structure:
{STORAGE_ROOT}/{DisplayName}_{SecretHash[:6]}/{YYYY-MM-DD}_{device_id}.jsonl

Audio assets are stored in:
{STORAGE_ROOT}/{DisplayName}_{SecretHash[:6]}/assets/{YYYYMMDD}/{uuid}.wav

This format:
- Is human-readable (contains display name)
- Avoids collisions (short hash suffix)
- Keeps user data organized
"""

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
import aiofiles

from app.config import get_settings


def sanitize_filename(name: str) -> str:
    """
    Sanitize a string to be safe for use in filenames.
    
    Removes unsafe characters like / \\ : * ? " < > |
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
    
    def _get_user_dir(self, user_id: str, user_info: Optional[object] = None) -> Path:
        """
        Get the directory for a specific user.
        
        Args:
            user_id: User identifier (display name or legacy user_id)
            user_info: Optional UserInfo object from auth service
        
        Returns:
            Path to user's data directory
        """
        # If we have auth user info, use the proper storage prefix
        if user_info is not None:
            try:
                from app.services.auth import get_user_storage_prefix
                prefix = get_user_storage_prefix(user_info)
                return self.storage_root / prefix
            except Exception:
                pass  # Fall back to simple user_id
        
        # Legacy: just use sanitized user_id
        safe_user_id = sanitize_filename(user_id)
        return self.storage_root / safe_user_id
    
    def _get_log_path(self, user_id: str, device_id: str, user_info: Optional[object] = None) -> Path:
        """
        Get the log file path for a user and device.
        
        Path format: {STORAGE_ROOT}/{UserPrefix}/{YYYY-MM-DD}_{device_id}.jsonl
        """
        user_dir = self._get_user_dir(user_id, user_info)
        date_str = datetime.now().strftime("%Y-%m-%d")
        safe_device_id = sanitize_filename(device_id)
        filename = f"{date_str}_{safe_device_id}.jsonl"
        return user_dir / filename
    
    def _get_assets_dir(self, user_id: str, user_info: Optional[object] = None) -> Path:
        """
        Get the assets directory for a user for today's date.
        
        Path format: {STORAGE_ROOT}/{UserPrefix}/assets/{YYYYMMDD}/
        """
        user_dir = self._get_user_dir(user_id, user_info)
        date_str = datetime.now().strftime("%Y%m%d")
        return user_dir / "assets" / date_str
    
    async def save_audio_file(
        self,
        wav_data: bytes,
        interaction_id: str,
        user_id: str,
        user_info: Optional[object] = None,
    ) -> str:
        """
        Save WAV audio file to assets directory.
        
        Args:
            wav_data: WAV audio data bytes
            interaction_id: UUID for this interaction (used as filename)
            user_id: User identifier
            user_info: Optional UserInfo for proper storage path
            
        Returns:
            Relative path to saved file (e.g., "assets/20260208/550e8400.wav")
        """
        assets_dir = self._get_assets_dir(user_id, user_info)
        assets_dir.mkdir(parents=True, exist_ok=True)
        
        # Use full UUID for filename to match log entry ID
        filename = f"{interaction_id}.wav"
        file_path = assets_dir / filename
        
        async with aiofiles.open(file_path, mode="wb") as f:
            await f.write(wav_data)
        
        # Return relative path from user directory
        user_dir = self._get_user_dir(user_id, user_info)
        relative_path = file_path.relative_to(user_dir)
        return str(relative_path)
    
    async def log_interaction(
        self,
        user_id: str,
        device_id: str,
        wav_data: bytes,
        step_results: list,
        total_latency_ms: int,
        user_info: Optional[object] = None,
    ) -> str:
        """
        Log an interaction to the user's JSONL file.
        
        Args:
            user_id: User identifier (display name)
            device_id: Client-provided device identifier
            wav_data: WAV audio data to save
            step_results: Ordered list of StepResult from pipeline
            total_latency_ms: Total processing latency (user-perceived)
            user_info: Optional UserInfo object for proper storage path
            
        Returns:
            Generated interaction ID
        """
        interaction_id = str(uuid.uuid4())
        
        # Save audio file
        audio_path = await self.save_audio_file(
            wav_data=wav_data,
            interaction_id=interaction_id,
            user_id=user_id,
            user_info=user_info,
        )
        
        # Serialize step results as ordered array (includes per-step latency)
        transcription = [
            {"step": r.step, "text": r.text, "latency_ms": r.latency_ms}
            for r in step_results
        ]
        
        data = {
            "id": interaction_id,
            "timestamp": datetime.now().isoformat(),
            "audio_path": audio_path,
            "transcription": transcription,
            "latency_stats": {
                "total_ms": total_latency_ms,
            },
        }
        
        # Get log path and ensure user directory exists
        log_path = self._get_log_path(user_id, device_id, user_info)
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
