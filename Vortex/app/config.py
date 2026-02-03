"""Application configuration loaded from environment variables."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""
    
    # API Keys
    groq_api_key: str = ""
    
    # Pipeline settings
    default_pipeline: str = "raw"
    
    # Server settings
    server_host: str = "0.0.0.0"
    server_port: int = 8000
    
    # Storage settings (Multi-User Distributed Storage)
    storage_root: str = "./data"  # Root path for all logs (can be NAS/Cloud mount)
    default_user_id: str = "default_user"  # Fallback if client sends no user_id
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
