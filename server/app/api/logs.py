"""
Logs API - JSONL log retrieval endpoints.

Provides endpoints for reading and querying stored logs.
"""

import json
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.services.auth import (
    UserInfo,
    get_current_user,
    get_user_storage_prefix,
)
from app.services.log_events import get_log_event_bus

router = APIRouter()


def get_log_entries(date: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Read log entries for a specific date.
    
    Args:
        date: Date in YYYY-MM-DD format
        user_id: Optional filter by user
    
    Returns:
        List of log entry dictionaries
    """
    settings = get_settings()
    storage_root = Path(settings.storage_root).resolve()
    
    if not storage_root.exists():
        return []
    
    entries = []
    
    # If user_id specified, only look in that user's directory
    if user_id:
        user_dirs = [storage_root / user_id]
    else:
        user_dirs = [d for d in storage_root.iterdir() if d.is_dir()]
    
    for user_dir in user_dirs:
        if not user_dir.exists():
            continue
            
        # Find all log files for this date
        pattern = f"{date}_*.jsonl"
        for log_file in user_dir.glob(pattern):
            try:
                with open(log_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            entry = json.loads(line)
                            entries.append(entry)
            except Exception as e:
                print(f"[Logs] Error reading {log_file}: {e}")
    
    # Sort by timestamp (newest first)
    entries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    return entries


@router.get("/api/logs")
async def get_logs(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get log entries for a specific date.
    Scoped to the authenticated user's directory.
    """
    # Validate date format
    if len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    prefix = get_user_storage_prefix(user)
    entries = get_log_entries(date, prefix)
    
    return {
        "entries": entries,
        "date": date,
        "count": len(entries),
    }


@router.get("/api/logs/dates")
async def get_available_dates(
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get list of dates that have logs.
    Scoped to the authenticated user's directory.
    """
    user_dir = _get_user_dir(user)
    
    if not user_dir.exists():
        return {"dates": []}
    
    dates = set()
    for log_file in user_dir.glob("*.jsonl"):
        name = log_file.stem
        if len(name) >= 10 and name[4] == "-" and name[7] == "-":
            date_part = name[:10]
            dates.add(date_part)
    
    sorted_dates = sorted(dates, reverse=True)
    return {"dates": sorted_dates}


def _get_user_dir(user: UserInfo) -> Path:
    """Get the authenticated user's storage directory."""
    settings = get_settings()
    storage_root = Path(settings.storage_root).resolve()
    prefix = get_user_storage_prefix(user)
    return storage_root / prefix


@router.delete("/api/logs/{entry_id}")
async def delete_log_entry(
    entry_id: str,
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Delete a single log entry by ID.
    
    Scoped to the authenticated user's directory only.
    """
    user_dir = _get_user_dir(user)
    
    if not user_dir.exists():
        raise HTTPException(status_code=404, detail="Entry not found")
    
    for log_file in user_dir.glob("*.jsonl"):
        try:
            lines = []
            deleted_entry = None
            
            with open(log_file, "r", encoding="utf-8") as f:
                for line in f:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    entry = json.loads(stripped)
                    if entry.get("id") == entry_id:
                        deleted_entry = entry
                    else:
                        lines.append(stripped)
            
            if deleted_entry:
                # Rewrite file without the deleted entry
                with open(log_file, "w", encoding="utf-8") as f:
                    for remaining_line in lines:
                        f.write(remaining_line + "\n")
                
                # Delete associated audio file
                audio_path = deleted_entry.get("audio_path")
                if audio_path:
                    abs_audio_path = user_dir / audio_path
                    if abs_audio_path.exists():
                        abs_audio_path.unlink()
                
                return {
                    "deleted": True,
                    "id": entry_id,
                }
        except Exception as e:
            print(f"[Logs] Error processing {log_file}: {e}")
    
    raise HTTPException(status_code=404, detail="Entry not found")


def _infer_pipeline_from_steps(transcription: list) -> str:
    """
    Infer pipeline key from existing transcription step names.

    Maps step names (e.g. "whisper_large_v3", "chinese_fixer_kimi-k2") back to
    PIPELINE_TEMPLATES by matching step lists.
    """
    from app.services.pipelines.manager import PIPELINE_TEMPLATES, STEP_CONFIGS
    from app.services.pipelines.raw_whisper import WhisperStep

    # Build reverse map: result step name -> template step name
    # "whisper_large_v3" -> "whisper", fixer steps map directly
    step_name_map = {}
    for template_name, cfg in STEP_CONFIGS.items():
        cls = cfg["class"]
        if cls is WhisperStep:
            step_name_map[WhisperStep.STEP_NAME] = template_name
        else:
            # LLMFixerStep: step_name arg IS the template key
            result_name = cfg.get("args", {}).get("step_name", template_name)
            step_name_map[result_name] = template_name

    print(f"[Retry] Step name map: {step_name_map}")

    # Convert transcription step names to template step names
    entry_steps = []
    raw_names = []
    for s in transcription:
        name = s.get("step", "") if isinstance(s, dict) else ""
        raw_names.append(name)
        if name in step_name_map:
            entry_steps.append(step_name_map[name])

    print(f"[Retry] Transcription step names: {raw_names}")
    print(f"[Retry] Mapped template steps: {entry_steps}")

    # Match against pipeline templates
    for pipeline_key, template_steps in PIPELINE_TEMPLATES.items():
        if entry_steps == template_steps:
            print(f"[Retry] Matched pipeline: {pipeline_key}")
            return pipeline_key

    print(f"[Retry] No match found, falling back to raw_whisper")
    return "raw_whisper"

from pydantic import BaseModel, Field

class RetryRequest(BaseModel):
    api_key: str = Field(default="", description="Groq API key (BYOK)")


@router.post("/api/logs/{entry_id}/retry")
async def retry_log_entry(
    entry_id: str,
    body: RetryRequest = None,
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Retry processing for a log entry.

    Reads the original audio file, re-runs the inferred pipeline,
    and replaces the entry in-place (same ID, same JSONL line position).

    Request body (optional):
        {"api_key": "gsk_..."}
    """
    import time
    from app.services.pipelines.manager import get_pipeline_manager
    from app.api.pipeline_config import read_user_config

    user_dir = _get_user_dir(user)

    if not user_dir.exists():
        raise HTTPException(status_code=404, detail="Entry not found")

    # 1. Find the entry and its file/line position
    target_file = None
    target_line_idx = None
    target_entry = None

    for log_file in user_dir.glob("*.jsonl"):
        try:
            lines = log_file.read_text(encoding="utf-8").strip().splitlines()
            for idx, line in enumerate(lines):
                if not line.strip():
                    continue
                entry = json.loads(line)
                if entry.get("id") == entry_id:
                    target_file = log_file
                    target_line_idx = idx
                    target_entry = entry
                    break
            if target_entry:
                break
        except Exception as e:
            print(f"[Logs] Error scanning {log_file}: {e}")

    if not target_entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # 2. Read the original audio file
    audio_path = target_entry.get("audio_path")
    if not audio_path:
        raise HTTPException(status_code=400, detail="No audio file associated with this entry")

    abs_audio_path = user_dir / audio_path
    if not abs_audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    wav_data = abs_audio_path.read_bytes()

    # 3. Infer pipeline from existing step names
    transcription = target_entry.get("transcription", [])
    pipeline_key = _infer_pipeline_from_steps(transcription)

    # 4. Load user config and run pipeline
    user_config, user_config_ver = read_user_config(user)
    manager = get_pipeline_manager()

    # API key: prefer user-provided (BYOK), fall back to server key
    api_key = body.api_key if body else ""
    if not api_key:
        settings = get_settings()
        api_key = settings.groq_api_key
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="API key required. Please provide your Groq API key to retry.",
        )

    t0 = time.time()
    try:
        step_results, final_text = await manager.run(
            pipeline_key,
            audio_bytes=wav_data,
            filename="retry.wav",
            user_config=user_config,
            api_key=api_key,
        )
    except ValueError as e:
        # Auth / validation errors -> 400
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")

    total_latency_ms = int((time.time() - t0) * 1000)

    # 5. Build updated entry (keep id, audio_path)
    from datetime import datetime
    from app.services.storage_service import _get_tz

    new_transcription = [
        {"step": r.step, "text": r.text, "latency_ms": r.latency_ms}
        for r in step_results
    ]

    # Build audit metadata
    meta = {}
    for r in step_results:
        if r.step not in ("whisper_large_v3", "error"):
            try:
                from app.services.prompt_service import get_prompt_service
                from app.services.pipelines.manager import STEP_CONFIGS
                ps = get_prompt_service()
                cfg = STEP_CONFIGS.get(r.step)
                if cfg:
                    prompt_key = cfg.get("args", {}).get("prompt_key")
                    if prompt_key:
                        ver = ps.get_prompt_version(prompt_key)
                        if "prompt_versions" not in meta:
                            meta["prompt_versions"] = {}
                        meta["prompt_versions"][r.step] = ver
            except Exception:
                pass
    if user_config_ver > 0:
        meta["user_config_ver"] = user_config_ver

    updated_entry = {
        **target_entry,
        "timestamp": datetime.now(tz=_get_tz()).isoformat(),
        "transcription": new_transcription,
        "latency_stats": {"total_ms": total_latency_ms},
    }
    if meta:
        updated_entry["meta"] = meta

    # 6. Replace the entry in-place in the JSONL file
    try:
        lines = target_file.read_text(encoding="utf-8").strip().splitlines()
        lines[target_line_idx] = json.dumps(updated_entry, ensure_ascii=False)
        target_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update log file: {str(e)}")

    # 7. Publish updated entry to WebSocket for real-time UI update
    try:
        bus = get_log_event_bus()
        prefix = get_user_storage_prefix(user)
        await bus.publish(updated_entry, user_prefix=prefix)
    except Exception as e:
        print(f"[Logs] Event publish error on retry: {e}")

    return updated_entry


@router.delete("/api/logs/date/{date}")
async def clear_day(
    date: str,
    user: UserInfo = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Delete ALL log entries and audio files for a given date.
    
    Scoped to the authenticated user's directory only.
    """
    # Validate date format
    if len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    user_dir = _get_user_dir(user)
    
    if not user_dir.exists():
        return {"deleted": True, "entries_removed": 0, "files_removed": 0}
    
    entries_removed = 0
    files_removed = 0
    
    # Convert date format for assets folder (YYYY-MM-DD -> YYYYMMDD)
    date_compact = date.replace("-", "")
    
    # Delete JSONL log files matching this date
    pattern = f"{date}_*.jsonl"
    for log_file in user_dir.glob(pattern):
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                entries_removed += sum(1 for line in f if line.strip())
            log_file.unlink()
            files_removed += 1
        except Exception as e:
            print(f"[Logs] Error deleting {log_file}: {e}")
    
    # Delete audio assets folder for this date
    assets_dir = user_dir / "assets" / date_compact
    if assets_dir.exists() and assets_dir.is_dir():
        try:
            audio_count = sum(1 for f in assets_dir.iterdir() if f.is_file())
            files_removed += audio_count
            shutil.rmtree(assets_dir)
        except Exception as e:
            print(f"[Logs] Error deleting {assets_dir}: {e}")
    
    return {
        "deleted": True,
        "entries_removed": entries_removed,
        "files_removed": files_removed,
    }


@router.get("/api/logs/export")
async def export_user_data(
    user: UserInfo = Depends(get_current_user),
):
    """
    Export all user data as a streaming zip archive.

    Uses stream-zip to send bytes to the client immediately as each file
    is read — no in-memory buffering of the full archive.
    """
    from datetime import datetime as dt
    from stream_zip import stream_zip, ZIP_32

    user_dir = _get_user_dir(user)

    if not user_dir.exists() or not any(user_dir.iterdir()):
        raise HTTPException(status_code=404, detail="No data to export")

    def member_files():
        for file_path in user_dir.rglob("*"):
            if file_path.is_file():
                arcname = str(file_path.relative_to(user_dir))
                modified_at = dt.fromtimestamp(file_path.stat().st_mtime)
                perms = 0o644

                def chunks(fp=file_path):
                    with open(fp, "rb") as f:
                        while True:
                            chunk = f.read(65536)
                            if not chunk:
                                break
                            yield chunk

                yield arcname, modified_at, perms, ZIP_32, chunks()

    safe_name = user.display_name.replace(" ", "_")
    filename = f"{safe_name}_export.zip"

    return StreamingResponse(
        stream_zip(member_files()),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket):
    """
    WebSocket for real-time log push to web frontend.
    
    Auth via query parameter: /ws/logs?token=sk-reliquary-...
    New log entries are broadcast only to the authenticated user's session.
    """
    # Authenticate via query parameter
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return
    
    from app.services.auth import verify_token, get_user_storage_prefix
    user = verify_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid auth token")
        return
    
    user_prefix = get_user_storage_prefix(user)
    
    await websocket.accept()
    bus = get_log_event_bus()
    bus.subscribe(websocket, user_prefix)
    try:
        while True:
            # Keep connection alive by waiting for client messages (pings)
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        bus.unsubscribe(websocket)
