#!/usr/bin/env python3
"""
Cleanup User Data Script

Deletes data for users who:
1. Are NOT admins (role != 'admin')
2. Were created more than 24 hours ago

Usage:
    python3 scripts/cleanup_users.py [--dry-run] [--force]
"""

import argparse
import hashlib
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to path to import config if needed, 
# but for safety/independence we'll use relative paths from the script location
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "users.db"


def get_short_hash(secret_hash: str, length: int = 6) -> str:
    """Get first N characters of hash for display/paths."""
    return secret_hash[:length]


def get_storage_path_name(display_name: str, secret_hash: str) -> str:
    """
    Replicate logic from app.services.auth.get_user_storage_prefix
    
    Format: {SafeDisplayName}_{ShortHash}
    """
    short_hash = get_short_hash(secret_hash)
    safe_name = display_name.replace(" ", "_").replace("/", "_")
    return f"{safe_name}_{short_hash}"


def cleanup(dry_run: bool = False, force: bool = False):
    if not DB_PATH.exists():
        print(f"[Error] Database not found at {DB_PATH}")
        sys.exit(1)

    print(f"[{datetime.now()}] Starting cleanup (Dry Run: {dry_run})")
    
    # Calculate cutoff time (24 hours ago)
    cutoff_time = datetime.now() - timedelta(hours=24)
    print(f"Cutoff time: {cutoff_time}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # Find target users
        cursor.execute(
            """
            SELECT id, display_name, secret_hash, role, created_at 
            FROM users 
            WHERE role != 'admin' AND created_at < ?
            """,
            (cutoff_time.isoformat(),)
        )
        users = cursor.fetchall()

        print(f"Found {len(users)} users to cleanup.")

        for user in users:
            uid = user['id']
            name = user['display_name']
            created_at = user['created_at']
            secret_hash = user['secret_hash']
            folder_name = get_storage_path_name(name, secret_hash)
            user_data_path = DATA_DIR / folder_name

            print(f"\nUser: {name} (ID: {uid})")
            print(f"  Created: {created_at}")
            print(f"  Folder:  {user_data_path}")

            # 1. Delete data folder
            if user_data_path.exists():
                if dry_run:
                    print(f"  [DRY RUN] Would delete folder: {user_data_path}")
                else:
                    try:
                        shutil.rmtree(user_data_path)
                        print(f"  [OK] Deleted folder")
                    except Exception as e:
                        print(f"  [Error] Failed to delete folder: {e}")
            else:
                print("  [Info] Folder not found (already deleted?)")

        if not dry_run:
            conn.commit()
            print("\nCleanup completed successfully.")
        else:
            print("\nDry run completed. No changes made.")

    except Exception as e:
        print(f"\n[Error] Cleanup failed: {e}")
        conn.rollback()
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cleanup old user data")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without actually deleting")
    parser.add_argument("--force", action="store_true", help="Skip confirmation (implied by default, just for compatibility)")
    args = parser.parse_args()

    cleanup(dry_run=args.dry_run, force=args.force)
