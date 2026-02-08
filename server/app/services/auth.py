"""
Authentication Service - Zero-Trust Multi-User Architecture.

Core Philosophy:
- Server NEVER stores raw API Keys or Master Secrets
- Authentication via SHA256 hash of Master Secret
- Client is "Source of Truth" for config

Storage: SQLite (users.db)
"""

import hashlib
import os
import secrets
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import get_settings


# ============== Data Models ==============

@dataclass
class User:
    """User data model."""
    id: str
    display_name: str
    role: str  # "user" or "admin"
    created_at: str
    secret_hash: str  # SHA256 hash - NEVER the plain secret


@dataclass
class UserInfo:
    """User info returned after authentication (no secret_hash)."""
    id: str
    display_name: str
    role: str
    created_at: str


# ============== Database ==============

def get_db_path() -> Path:
    """Get the database file path."""
    settings = get_settings()
    storage_root = Path(settings.storage_root).resolve()
    storage_root.mkdir(parents=True, exist_ok=True)
    return storage_root / "users.db"


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize the database schema."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                secret_hash TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL DEFAULT 'user',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create index for faster lookup by secret_hash
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_secret_hash 
            ON users(secret_hash)
        """)
        
        print("[Auth] Database initialized")


# ============== Crypto Utilities ==============

def hash_secret(secret: str) -> str:
    """
    Hash a secret using SHA256.
    
    Args:
        secret: Plain text secret (e.g., "sk-reliquary-abc123...")
    
    Returns:
        Hex-encoded SHA256 hash
    """
    return hashlib.sha256(secret.encode('utf-8')).hexdigest()


def generate_secret() -> str:
    """
    Generate a new master secret.
    
    Format: sk-reliquary-{32 random hex chars}
    
    Returns:
        Plain text secret (only shown once)
    """
    random_part = secrets.token_hex(16)  # 32 hex characters
    return f"sk-reliquary-{random_part}"


def get_short_hash(secret_hash: str, length: int = 6) -> str:
    """Get first N characters of hash for display/paths."""
    return secret_hash[:length]


# ============== User Management ==============

def register_user(display_name: str, invite_code: str) -> Optional[str]:
    """
    Register a new user.
    
    Args:
        display_name: User's chosen name (e.g., "Xinghan")
        invite_code: Invite code for registration
    
    Returns:
        Plain text Master Secret (ONLY shown once!) or None if invalid invite
    
    Raises:
        ValueError: If invite code is invalid
    """
    settings = get_settings()
    
    # Verify invite code
    admin_code = getattr(settings, 'admin_invite_code', None) or os.environ.get('ADMIN_INVITE_CODE', 'reliquary-admin-2026')
    user_code = getattr(settings, 'user_invite_code', None) or os.environ.get('USER_INVITE_CODE', 'reliquary-user-2026')
    
    if invite_code == admin_code:
        role = "admin"
    elif invite_code == user_code:
        role = "user"
    else:
        raise ValueError("Invalid invite code")
    
    # Generate credentials
    import uuid
    user_id = str(uuid.uuid4())
    plain_secret = generate_secret()
    secret_hash = hash_secret(plain_secret)
    short_hash = get_short_hash(secret_hash)
    
    # Store in database
    with get_db() as conn:
        try:
            conn.execute(
                """
                INSERT INTO users (id, display_name, secret_hash, role, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, display_name, secret_hash, role, datetime.now().isoformat())
            )
        except sqlite3.IntegrityError:
            # Extremely unlikely hash collision
            raise ValueError("Registration failed, please try again")
    
    # Create user's storage folder: {DisplayName}_{Hash[:6]}/
    storage_root = Path(settings.storage_root).resolve()
    safe_name = display_name.replace(" ", "_").replace("/", "_")
    user_folder = storage_root / f"{safe_name}_{short_hash}"
    user_folder.mkdir(parents=True, exist_ok=True)
    
    print(f"[Auth] Registered new {role}: {display_name} (id: {user_id[:8]}...)")
    print(f"[Auth] Created storage folder: {user_folder.name}")
    
    # Return the plain secret - THIS IS THE ONLY TIME IT'S AVAILABLE
    return plain_secret


def verify_token(token: str) -> Optional[UserInfo]:
    """
    Verify an authentication token.
    
    Args:
        token: The Master Secret provided by the client
    
    Returns:
        UserInfo if valid, None if invalid
    """
    if not token or not token.startswith("sk-reliquary-"):
        return None
    
    token_hash = hash_secret(token)
    
    with get_db() as conn:
        cursor = conn.execute(
            """
            SELECT id, display_name, role, created_at
            FROM users
            WHERE secret_hash = ?
            """,
            (token_hash,)
        )
        row = cursor.fetchone()
    
    if row is None:
        return None
    
    return UserInfo(
        id=row["id"],
        display_name=row["display_name"],
        role=row["role"],
        created_at=row["created_at"],
    )


def get_user_by_id(user_id: str) -> Optional[User]:
    """Get user by ID (for admin operations)."""
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,)
        )
        row = cursor.fetchone()
    
    if row is None:
        return None
    
    return User(
        id=row["id"],
        display_name=row["display_name"],
        secret_hash=row["secret_hash"],
        role=row["role"],
        created_at=row["created_at"],
    )


def list_users() -> list[UserInfo]:
    """List all users (admin only, no secrets)."""
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT id, display_name, role, created_at FROM users ORDER BY created_at DESC"
        )
        rows = cursor.fetchall()
    
    return [
        UserInfo(
            id=row["id"],
            display_name=row["display_name"],
            role=row["role"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


def get_user_storage_prefix(user: UserInfo) -> str:
    """
    Get the storage path prefix for a user.
    
    Format: {Display_Name}_{SecretHash[:6]}
    Example: "Xinghan_a1b2c3"
    """
    # Get full user with hash
    full_user = get_user_by_id(user.id)
    if not full_user:
        # Fallback to just display name
        return user.display_name.replace(" ", "_")
    
    short_hash = get_short_hash(full_user.secret_hash)
    safe_name = user.display_name.replace(" ", "_").replace("/", "_")
    return f"{safe_name}_{short_hash}"


# ============== Dependency for FastAPI ==============

from fastapi import Depends, Header, HTTPException, status


async def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_reliquary_token: Optional[str] = Header(None, alias="X-Reliquary-Token"),
) -> UserInfo:
    """
    FastAPI dependency to authenticate requests.
    
    Accepts token via:
    - Authorization: Bearer sk-reliquary-...
    - X-Reliquary-Token: sk-reliquary-...
    
    Raises:
        HTTPException: 401 if not authenticated
    """
    token = None
    
    # Try Authorization header first
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]  # Remove "Bearer " prefix
    
    # Fallback to X-Reliquary-Token header
    if not token and x_reliquary_token:
        token = x_reliquary_token
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = verify_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


async def get_admin_user(
    user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    """Dependency that requires admin role."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


# Optional auth - returns None if not authenticated
async def get_optional_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_reliquary_token: Optional[str] = Header(None, alias="X-Reliquary-Token"),
) -> Optional[UserInfo]:
    """Optional authentication - returns None if not authenticated."""
    token = None
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif x_reliquary_token:
        token = x_reliquary_token
    
    if not token:
        return None
    
    return verify_token(token)
