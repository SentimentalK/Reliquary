"""
Logs API - JSONL log retrieval endpoints.

Provides endpoints for reading and querying stored logs.
"""

import json
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

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


@router.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket):
    """
    WebSocket for real-time log push to web frontend.
    
    New log entries are broadcast to all subscribers when saved.
    Client sends periodic pings; server pushes {type: "new_entry", entry: {...}}.
    """
    await websocket.accept()
    bus = get_log_event_bus()
    bus.subscribe(websocket)
    print("[WS/Logs] Client subscribed")
    try:
        while True:
            # Keep connection alive by waiting for client messages (pings)
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        bus.unsubscribe(websocket)
        print("[WS/Logs] Client unsubscribed")

