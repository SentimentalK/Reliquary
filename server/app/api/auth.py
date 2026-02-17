"""
Auth API - User Registration and Authentication.

Endpoints:
- POST /api/auth/register - Register new user
- GET /api/auth/me - Get current user info
- GET /api/auth/users - List all users (admin only)
"""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.services.auth import (
    UserInfo,
    get_admin_user,
    get_current_user,
    list_users,
    register_user,
)

router = APIRouter()


# ============== Request/Response Models ==============

class RegisterRequest(BaseModel):
    """Registration request."""
    display_name: str
    invite_code: str


class RegisterResponse(BaseModel):
    """Registration response with the secret (shown once!)."""
    user_id: str
    display_name: str
    role: str
    master_secret: str  # ⚠️ Only returned once, client must save it!
    message: str


class UserResponse(BaseModel):
    """User info response (no secrets)."""
    id: str
    display_name: str
    role: str
    created_at: str


class UsersListResponse(BaseModel):
    """List of users (admin only)."""
    users: list[UserResponse]
    count: int


# ============== Endpoints ==============

DISK_USAGE_THRESHOLD = 0.80  # 80%


@router.post("/api/auth/register", response_model=RegisterResponse)
async def register(request: RegisterRequest):
    """
    Register a new user.
    
    **⚠️ IMPORTANT: The returned `master_secret` is only shown ONCE!**
    
    The client MUST save this secret securely (e.g., in local config).
    There is NO password reset - if lost, create a new account.
    
    Args:
        display_name: User's chosen display name
        invite_code: Invite code for registration
    
    Returns:
        User info and the master secret (one-time display)
    """
    # --- Disk capacity guard ---
    settings = get_settings()
    storage_path = Path(settings.storage_root).resolve()
    storage_path.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(storage_path)
    if usage.used / usage.total >= DISK_USAGE_THRESHOLD:
        raise HTTPException(
            status_code=503,
            detail="Trial slots full. Server storage overloaded. Please try again later.",
        )

    try:
        secret = register_user(request.display_name, request.invite_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Verify the new user exists
    from app.services.auth import verify_token
    user = verify_token(secret)
    
    if not user:
        raise HTTPException(status_code=500, detail="Registration failed")
    
    return RegisterResponse(
        user_id=user.id,
        display_name=user.display_name,
        role=user.role,
        master_secret=secret,
        message="⚠️ Save this secret! It will NOT be shown again.",
    )


@router.get("/api/auth/me", response_model=UserResponse)
async def get_me(user: UserInfo = Depends(get_current_user)):
    """
    Get current authenticated user info.
    
    Requires: Authorization header with token
    """
    return UserResponse(
        id=user.id,
        display_name=user.display_name,
        role=user.role,
        created_at=user.created_at,
    )


@router.get("/api/auth/users", response_model=UsersListResponse)
async def get_users(admin: UserInfo = Depends(get_admin_user)):
    """
    List all registered users.
    
    **Admin only.**
    """
    users = list_users()
    return UsersListResponse(
        users=[
            UserResponse(
                id=u.id,
                display_name=u.display_name,
                role=u.role,
                created_at=u.created_at,
            )
            for u in users
        ],
        count=len(users),
    )


class VerifyResponse(BaseModel):
    """Token verification response."""
    valid: bool
    user: UserResponse | None = None


@router.get("/api/auth/verify")
async def verify_token_endpoint(user: UserInfo = Depends(get_current_user)):
    """
    Verify an authentication token.
    
    Used by the web UI login flow to validate tokens.
    """
    return VerifyResponse(
        valid=True,
        user=UserResponse(
            id=user.id,
            display_name=user.display_name,
            role=user.role,
            created_at=user.created_at,
        ),
    )

