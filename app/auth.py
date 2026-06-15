"""Auth / user resolution.

Phase 1 fallback: X-User-Id header, resolved via Profile PK lookup.
Phase 2 primary (when backend=supabase): resolves JWT via Supabase Auth.

The api routers import `current_user` via this module; the function
below dispatches to the correct backend at runtime by checking config.

This keeps the api/*.py import lines unchanged.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import Profile
from app.services.supabase_client import get_supabase


async def current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> Profile:
    """Resolve the authenticated user.

    Delegates to the backend-specific resolver based on config.
    """
    if settings.database_backend == "supabase":
        return await _supabase_user(request, session, x_user_id)
    return await _simple_user(x_user_id, session)


async def _simple_user(
    x_user_id: Optional[str],
    session: AsyncSession,
) -> Profile:
    """Phase 1: X-User-Id header only."""
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-User-Id header (Phase 1 auth placeholder)",
        )
    profile = await session.get(Profile, x_user_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown user id (X-User-Id does not match any profile)",
        )
    return profile


async def _supabase_user(
    request: Request,
    session: AsyncSession,
    x_user_id: Optional[str],
) -> Profile:
    """Phase 2: JWT via Authorization header, fallback to X-User-Id."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        sb = get_supabase()
        if sb is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase client not configured (set database_backend=supabase)",
            )
        try:
            user_resp = sb.auth.get_user(token)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid or expired JWT: {exc}",
            ) from exc

        uid = user_resp.user.id
        profile = await session.get(Profile, uid)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authenticated user has no profile record",
            )
        return profile

    # Fallback to header (useful during dev / curl testing)
    return await _simple_user(x_user_id, session)