"""Profile endpoints.

POST /profiles — create a profile record (used by /auth/register after
Supabase Auth user is created).
GET /profiles/me — fetch the caller's profile.
PATCH /profiles — update the current user's profile (name, avatar, etc.).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.models import Profile
from app.schemas import ProfileOut, ProfileUpdate

router = APIRouter(tags=["profiles"])


@router.post("/profiles", response_model=ProfileOut, status_code=201)
async def create_profile(
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileOut:
    """Idempotent: ensures a profile row exists for the current user."""
    existing = await session.get(Profile, user.id)
    if existing:
        return ProfileOut.model_validate(existing)
    profile = Profile(id=user.id, role="student")
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.get("/profiles/me", response_model=ProfileOut)
async def get_my_profile(
    user: Profile = Depends(current_user),
) -> ProfileOut:
    return ProfileOut.model_validate(user)


@router.patch("/profiles", response_model=ProfileOut)
async def update_profile(
    body: ProfileUpdate,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileOut:
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.username is not None:
        user.username = body.username
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url

    await session.commit()
    await session.refresh(user)
    return ProfileOut.model_validate(user)