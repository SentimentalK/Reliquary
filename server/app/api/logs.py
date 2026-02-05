"""
Logs API - JSONL log retrieval endpoints.

Provides endpoints for reading and querying stored logs.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings

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
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
) -> Dict[str, Any]:
    """
    Get log entries for a specific date.
    
    Args:
        date: Date to query (required)
        user_id: Optional user filter
    
    Returns:
        {entries: [...], date: "...", user_id: "..."}
    """
    # Validate date format
    if len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    entries = get_log_entries(date, user_id)
    
    return {
        "entries": entries,
        "date": date,
        "user_id": user_id,
        "count": len(entries),
    }


@router.get("/api/logs/dates")
async def get_available_dates(
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
) -> Dict[str, Any]:
    """
    Get list of dates that have logs.
    
    Returns:
        {dates: ["2026-02-03", "2026-02-02", ...]}
    """
    settings = get_settings()
    storage_root = Path(settings.storage_root).resolve()
    
    if not storage_root.exists():
        return {"dates": []}
    
    dates = set()
    
    # If user_id specified, only look in that user's directory
    if user_id:
        user_dirs = [storage_root / user_id]
    else:
        user_dirs = [d for d in storage_root.iterdir() if d.is_dir()]
    
    for user_dir in user_dirs:
        if not user_dir.exists():
            continue
            
        for log_file in user_dir.glob("*.jsonl"):
            # Extract date from filename (YYYY-MM-DD_device.jsonl)
            name = log_file.stem
            if len(name) >= 10 and name[4] == "-" and name[7] == "-":
                date_part = name[:10]
                dates.add(date_part)
    
    # Sort dates (newest first)
    sorted_dates = sorted(dates, reverse=True)
    
    return {"dates": sorted_dates}
