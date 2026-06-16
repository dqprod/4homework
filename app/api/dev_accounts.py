"""Direct test endpoints - dev only helper for seeding accounts without
email confirmation flow. Disable or remove in production."""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import ParentChild, Profile
from app.schemas import ProfileOut
from app.services.supabase_client import get_supabase

router = APIRouter(tags=["dev-accounts"])


@router.post("/dev/create-test-account")
async def create_test_account(
    email: str,
    password: str,
    full_name: str,
    role: str = "student",
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create a Supabase Auth user directly via Admin API.

    Requires SUPABASE_SERVICE_KEY env var (do NOT commit this to repo / frontend).
    Used by smoke tests to skip email confirmation.
    """
    sb = get_supabase()
    if not sb:
        raise HTTPException(500, "Supabase not configured")

    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not service_key:
        raise HTTPException(500, "SUPABASE_SERVICE_KEY env required for this dev endpoint")

    # Create auth user with admin API call (auto-confirm)
    try:
        # Use service role client for admin
        service_url = os.environ["SUPABASE_URL"]
        admin_sb = __import__("supabase").create_client(service_url, service_key)
        auth_resp = admin_sb.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        user = auth_resp.user if hasattr(auth_resp, "user") else None
        if not user:
            raise Exception(auth_resp)
        uid = user.id
    except Exception as e:
        raise HTTPException(400, f"Auth create failed: {e}")

    profile = Profile(id=uid, full_name=full_name, role=role)
    session.add(profile)
    await session.commit()
    return {"user_id": uid, "email": email, "role": role}


@router.post("/dev/link-children")
async def link_children(
    parent_id: str,
    child_ids: list[str],
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Helper used by seed script - creates parent_child links."""
    created = 0
    for cid in child_ids:
        existing = (await session.execute(
            select(ParentChild).where(
                ParentChild.parent_id == parent_id,
                ParentChild.child_id == cid,
            ))).scalar_one_or_none()
        if existing:
            continue
        session.add(ParentChild(parent_id=parent_id, child_id=cid))
        created += 1
    await session.commit()
    return {"created": created}