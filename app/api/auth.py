"""Auth endpoints - registration & login via Supabase Auth.

Production-grade endpoints that route through Supabase Auth.
Note: supabase-py accept publishable + secret keys.
"""
import os
import httpx
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.models import Profile
from app.schemas import AuthLoginResponse, AuthRegisterRequest, ProfileOut
from app.services.supabase_client import get_supabase

router = APIRouter(tags=["auth"])


def _service_client():
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not service_key:
        return None
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], service_key)


@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register(
    body: AuthRegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Register a new user via Supabase Auth and create a profile record."""
    sb = _service_client() or get_supabase()
    if sb is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    try:
        # 1. Create auth user (auto-confirm to skip email verification)
        service_sb = _service_client()
        if service_sb:
            auth_resp = service_sb.auth.admin.create_user({
                "email": body.email,
                "password": body.password,
                "email_confirm": True,
            })
            user = auth_resp.user
        else:
            auth_resp = sb.auth.sign_up({
                "email": body.email,
                "password": body.password,
            })
            user = auth_resp.user
        if not user:
            raise HTTPException(status_code=400, detail="User creation failed")
        uid = getattr(user, "id", None) or user["id"]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Auth registration failed: {e}")

    # 2. Create profile record
    try:
        profile = Profile(
            id=uid,
            full_name=body.full_name,
            role=body.role,
            username=body.username,
        )
        session.add(profile)
        await session.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile creation failed: {e}")

    return {"message": "User registered", "user_id": uid}


@router.post("/auth/login", response_model=AuthLoginResponse)
async def login(
    body: AuthRegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> AuthLoginResponse:
    """Login with email/password via Supabase Auth, return access token.

    We call Supabase Auth's sign-in endpoint directly so we don't need
    service_role key (works with publishable key in this version).
    Also ensures a profile row exists in the local database.
    """
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{url}/auth/v1/token?grant_type=password",
            headers={
                "apikey": key,
                "Content-Type": "application/json",
            },
            json={"email": body.email, "password": body.password},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail=f"Invalid credentials: {r.text}")
        data = r.json()
        user_id = data["user"]["id"]
        user_email = data["user"].get("email", "")
        user_meta = data["user"].get("user_metadata", {})

        # Ensure a profile row exists in the local database
        profile = await session.get(Profile, user_id)
        if not profile:
            profile = Profile(
                id=user_id,
                full_name=user_meta.get("full_name", user_email.split("@")[0]),
                role=user_meta.get("role", "student"),
            )
            session.add(profile)
            await session.commit()

        return AuthLoginResponse(
            access_token=data["access_token"],
            token_type="bearer",
            user_id=user_id,
        )


@router.get("/auth/me", response_model=ProfileOut)
async def get_me(
    user: Profile = Depends(current_user),
) -> ProfileOut:
    """Get current authenticated user profile."""
    return ProfileOut.model_validate(user)