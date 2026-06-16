"""Async DB session factory + table init + subject seeding."""
from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import SEED_SUBJECTS, Base, Profile, Subject


def _build_engine():
    url = settings.database_url or "sqlite+aiosqlite:///./homework.db"
    return create_async_engine(url, echo=False, future=True)


engine = _build_engine()
SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


DEMO_PROFILES = [
    ("test-user-0000-0000-0000-000000000001", "Taro (テスト)", "student", "taro_demo"),
    ("d853df1d-dcb7-407c-a9f8-0538aa70ee42", "お父さん (テスト)", "parent", "parent_demo"),
]


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        existing_subjects = set((await session.execute(select(Subject.name))).scalars().all())
        for name, icon in SEED_SUBJECTS:
            if name not in existing_subjects:
                session.add(Subject(name=name, icon=icon))
        await session.commit()

        existing_profile_ids = set((await session.execute(select(Profile.id))).scalars().all())
        for pid, full_name, role, username in DEMO_PROFILES:
            if pid not in existing_profile_ids:
                session.add(Profile(id=pid, full_name=full_name, role=role, username=username))
        await session.commit()