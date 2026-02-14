"""
Pipeline Config API — step-level user settings.

User config is stored as append-only JSONL:
    {user_dir}/user_config.jsonl

Each line:
    {"ver": N, "ts": <unix>, "config": {step_name: {keywords, user_prompt}}}

Config is flat at the step level — no pipeline nesting.
A step like "chinese_fixer_kimi-k2" has one config regardless of which
pipeline it appears in.

Endpoints:
- GET  /api/pipeline-config/schema  — All configurable steps
- GET  /api/pipeline-config         — Read user's current step configs
- PUT  /api/pipeline-config         — Update user's step configs
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.auth import (
    UserInfo,
    get_current_user,
    get_user_storage_prefix,
)
from app.services.pipelines.manager import STEP_CONFIGS
from app.services.prompt_service import get_prompt_service

router = APIRouter()

MAX_KEYWORDS = 10


# ============== Models ==============

class StepConfig(BaseModel):
    """Per-step user config."""
    keywords: List[str] = Field(default_factory=list, max_length=MAX_KEYWORDS)
    user_prompt: str = ""


class ConfigUpdate(BaseModel):
    """Request body: { step_name: StepConfig }"""
    config: Dict[str, StepConfig]


# ============== Helpers ==============

def _get_user_dir(user_info: UserInfo) -> Path:
    settings = get_settings()
    storage_root = Path(settings.storage_root).resolve()
    prefix = get_user_storage_prefix(user_info)
    return storage_root / prefix


def _get_config_path(user_info: UserInfo) -> Path:
    return _get_user_dir(user_info) / "user_config.jsonl"


def _get_legacy_config_path(user_info: UserInfo) -> Path:
    return _get_user_dir(user_info) / "user_config.json"


def _migrate_if_needed(user_info: UserInfo) -> None:
    """
    One-time migration from old formats:
    1. user_config.json (flat or pipeline-nested) → JSONL ver=1
    """
    jsonl_path = _get_config_path(user_info)
    if jsonl_path.exists():
        return

    json_path = _get_legacy_config_path(user_info)
    if not json_path.exists():
        return

    try:
        old = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception:
        return

    if not old:
        return

    # Flatten if old format was pipeline-nested:
    # {"whisper_chinese_fixer": {"chinese_fixer": {...}}} → {"chinese_fixer": {...}}
    flat: Dict[str, Any] = {}
    for key, val in old.items():
        if isinstance(val, dict) and "keywords" not in val and "user_prompt" not in val:
            # This is a pipeline-nested entry — extract inner steps
            for step_name, step_cfg in val.items():
                if step_name not in flat:
                    flat[step_name] = step_cfg
        else:
            # Already flat
            flat[key] = val

    entry = {"ver": 1, "ts": int(time.time()), "config": flat}
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    with open(jsonl_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def read_user_config(user_info: UserInfo) -> Tuple[Dict[str, Any], int]:
    """
    Read user config (last JSONL line).
    
    Returns:
        (config_dict, version).  Flat: {step_name: {keywords, user_prompt}}
    """
    _migrate_if_needed(user_info)

    path = _get_config_path(user_info)
    if not path.exists():
        return {}, 0

    try:
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        if not lines:
            return {}, 0
        last = json.loads(lines[-1])
        return last.get("config", {}), last.get("ver", 0)
    except Exception:
        return {}, 0


def write_user_config(user_info: UserInfo, config: Dict[str, Any]) -> int:
    _migrate_if_needed(user_info)
    _current, current_ver = read_user_config(user_info)
    new_ver = current_ver + 1

    entry = {"ver": new_ver, "ts": int(time.time()), "config": config}
    path = _get_config_path(user_info)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return new_ver


def _get_configurable_steps() -> Dict[str, Any]:
    """
    Build schema of all configurable steps.
    
    Returns: {step_name: {system_prompt: str}}
    Only includes LLMFixerStep instances (those with a prompt_key).
    """
    ps = get_prompt_service()
    result = {}

    for step_name, cfg in STEP_CONFIGS.items():
        args = cfg.get("args", {})
        prompt_key = args.get("prompt_key")
        if not prompt_key:
            continue
        try:
            system_prompt = ps.get_prompt(prompt_key)
        except FileNotFoundError:
            system_prompt = ""
        if system_prompt:
            result[step_name] = {
                "step_name": step_name,
                "system_prompt": system_prompt.strip(),
            }

    return result


# ============== Endpoints ==============

@router.get("/api/pipeline-config/schema")
async def get_schema(
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return all configurable steps and their system prompts."""
    return {"steps": _get_configurable_steps()}


@router.get("/api/pipeline-config")
async def get_config(
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    config, ver = read_user_config(user)
    return {"config": config, "version": ver}


@router.put("/api/pipeline-config")
async def update_config(
    body: ConfigUpdate,
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update user's step configs."""
    valid_steps = _get_configurable_steps()

    config_dict = {}
    for step_name, step_config in body.config.items():
        if step_name not in valid_steps:
            continue  # skip unknown steps
        if len(step_config.keywords) > MAX_KEYWORDS:
            raise HTTPException(400, f"Max {MAX_KEYWORDS} keywords per step")
        config_dict[step_name] = {
            "keywords": step_config.keywords,
            "user_prompt": step_config.user_prompt,
        }

    new_ver = write_user_config(user, config_dict)
    return {"success": True, "config": config_dict, "version": new_ver}
