"""Application configuration loaded from environment variables."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""
    
    # API Keys (Server-side fallback, clients should use BYOK)
    groq_api_key: str = ""
    
    # Pipeline settings
    default_pipeline: str = "raw_whisper"
    
    # Server settings
    server_host: str = "0.0.0.0"
    server_port: int = 8080
    
    # Storage settings (Multi-User Distributed Storage)
    storage_root: str = "../data"  # Root path for all logs (can be NAS/Cloud mount)
    
    # Timezone for date-based storage (IANA timezone name)
    timezone: str = "America/New_York"
    
    # Authentication - Invite Codes
    admin_invite_code: str = "reliquary-admin-2026"  # Override via ADMIN_INVITE_CODE env
    user_invite_code: str = "reliquary-user-2026"    # Override via USER_INVITE_CODE env
    
    # Auth settings
    require_auth: bool = True  # Set to False for development/local use
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
