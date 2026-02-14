"""
Pipeline Config API - User-customizable pipeline step settings.

Endpoints:
- GET  /api/pipeline-config/schema  — Available pipelines and their configurable steps
- GET  /api/pipeline-config         — Read user's current config
- PUT  /api/pipeline-config         — Update user's config
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.auth import (
    UserInfo,
    get_current_user,
    get_user_storage_prefix,
)
from app.services.pipelines.manager import PIPELINE_TEMPLATES, STEP_REGISTRY

router = APIRouter()

# Max keywords to prevent hallucination from overly long context
MAX_KEYWORDS = 10


# ============== Models ==============

class StepConfig(BaseModel):
    """Per-step user config."""
    keywords: List[str] = Field(default_factory=list, max_length=MAX_KEYWORDS)
    user_prompt: str = ""


class PipelineConfigUpdate(BaseModel):
    """Request body: { pipeline_key: { step_name: StepConfig } }"""
    config: Dict[str, Dict[str, StepConfig]]


# ============== Helpers ==============

def _get_config_path(user_info: UserInfo) -> Path:
    """Get path to user's config file."""
    settings = get_settings()
    storage_root = Path(settings.storage_root).resolve()
    prefix = get_user_storage_prefix(user_info)
    return storage_root / prefix / "user_config.json"


def read_user_config(user_info: UserInfo) -> Dict[str, Any]:
    """Read user config from disk. Returns empty dict if not exists."""
    path = _get_config_path(user_info)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_user_config(user_info: UserInfo, config: Dict[str, Any]) -> None:
    """Write user config to disk."""
    path = _get_config_path(user_info)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _get_configurable_pipelines() -> Dict[str, Any]:
    """
    Build schema of configurable pipelines and their steps.
    
    Iterates PIPELINE_TEMPLATES, looks up each step class in STEP_REGISTRY,
    and includes steps that have a non-empty SYSTEM_PROMPT (i.e. fixer steps).
    """
    result = {}
    
    for pipeline_key, step_names in PIPELINE_TEMPLATES.items():
        steps = []
        for step_name in step_names:
            step_cls = STEP_REGISTRY.get(step_name)
            if step_cls is None:
                continue
            # Only include steps that have a configurable SYSTEM_PROMPT
            system_prompt = getattr(step_cls, "SYSTEM_PROMPT", "")
            if system_prompt and system_prompt.strip():
                steps.append({
                    "step_name": getattr(step_cls, "STEP_NAME", step_name),
                    "system_prompt": system_prompt.strip(),
                })
        
        # Only include pipelines that have configurable steps
        if steps:
            result[pipeline_key] = {"steps": steps}
    
    return result


# ============== Endpoints ==============

@router.get("/api/pipeline-config/schema")
async def get_schema(
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get configurable pipelines and their steps.
    
    Returns schema for the frontend to render config forms.
    Each step includes the base system_prompt for display.
    """
    return {"pipelines": _get_configurable_pipelines()}


@router.get("/api/pipeline-config")
async def get_config(
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """Read user's pipeline config."""
    config = read_user_config(user)
    return {"config": config}


@router.put("/api/pipeline-config")
async def update_config(
    body: PipelineConfigUpdate,
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Update user's pipeline config.
    
    Validates pipeline keys and step names against the registry.
    Enforces keyword limit.
    """
    schema = _get_configurable_pipelines()
    
    for pipeline_key, steps in body.config.items():
        if pipeline_key not in schema:
            raise HTTPException(400, f"Pipeline '{pipeline_key}' is not configurable")
        
        valid_step_names = {s["step_name"] for s in schema[pipeline_key]["steps"]}
        for step_name, step_config in steps.items():
            if step_name not in valid_step_names:
                raise HTTPException(400, f"Step '{step_name}' not found in pipeline '{pipeline_key}'")
            if len(step_config.keywords) > MAX_KEYWORDS:
                raise HTTPException(400, f"Max {MAX_KEYWORDS} keywords per step")
    
    # Serialize to plain dict for storage
    config_dict = {
        pk: {
            sn: {"keywords": sc.keywords, "user_prompt": sc.user_prompt}
            for sn, sc in steps.items()
        }
        for pk, steps in body.config.items()
    }
    
    write_user_config(user, config_dict)
    return {"success": True, "config": config_dict}
