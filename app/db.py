"""Async DB session factory + table init + subject seeding.

Supports both SQLite (pytest / dev) and Supabase PostgreSQL (production).
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.models import SEED_SUBJECTS, Base, Subject


def _build_engine():
    """Return an async engine for the configured backend.

    SQLite (default, pytest/Phase 1):
      sqlite+aiosqlite:///./homework.db
    PostgreSQL (Supabase):
      The DATABASE_URL should be the Supabase PG connection string with async
      driver, e.g. postgresql+asyncpg://<user>:<pass>@<host>:<port>/<db>.
      If DATABASE_URL isn't set for supabase, build it from SUPABASE_URL env.
    """
    url = settings.database_url
    if settings.database_backend == "supabase":
        # Default: derive PG URL from SUPABASE_URL if DATABASE_URL not explicit.
        if url == "sqlite+aiosqlite:///./homework.db":
            raise ValueError(
                "database_backend=supabase requires DATABASE_URL or SUPABASE_URL to be set"
            )
    return create_async_engine(url, echo=False, future=True)


engine = _build_engine()
SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create all tables and seed the five subjects if absent.

    Safe to call repeatedly. Idempotent for both schema and seed.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        existing = (await session.execute(select(Subject.name))).scalars().all()
        existing_set = set(existing)
        for name, icon in SEED_SUBJECTS:
            if name not in existing_set:
                session.add(Subject(name=name, icon=icon))
        await session.commit()
