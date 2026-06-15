"""Profile endpoints.

PATCH /profiles — update the current user's profile (name, avatar, etc.).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.models import Profile
from app.schemas import ProfileOut, ProfileUpdate

router = APIRouter(tags=["profiles"])


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