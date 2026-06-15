"""Supabase Auth adapter. Parses JWT from Authorization: Bearer <token>
and resolves the matching Profile row.

Phase 2: the old X-User-Id header is still accepted as fallback for
backward compatibility.  Phase 3 will make JWT mandatory.

Usage (in api routes):
    user = await get_current_supabase_user(request, session)
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Profile
from app.services.supabase_client import get_supabase


async def get_current_supabase_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Profile:
    """Resolve the authenticated user.

    Priority:
      1. Authorization: Bearer <JWT> — resolves via Supabase Auth + PK
      2. X-User-Id header (Phase 1 backward compat)
    """
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

    # Fallback: X-User-Id header (Phase 1)
    xuid = request.headers.get("X-User-Id")
    if xuid:
        profile = await session.get(Profile, xuid)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown user id (X-User-Id does not match any profile)",
            )
        return profile

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing Authorization header or X-User-Id header",
    )