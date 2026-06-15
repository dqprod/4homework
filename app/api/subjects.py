"""Subjects lookup — small helper endpoint, useful for the frontend
dropdown and for verifying the seed worked."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Subject
from pydantic import BaseModel

router = APIRouter(tags=["subjects"])


class SubjectOut(BaseModel):
    id: int
    name: str
    icon: str | None = None

    model_config = {"from_attributes": True}


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(session: AsyncSession = Depends(get_session)) -> list[SubjectOut]:
    rows = (await session.execute(select(Subject).order_by(Subject.id))).scalars().all()
    return [SubjectOut.model_validate(r) for r in rows]
