"""Shared pytest fixtures. Each test gets a fresh in-memory DB and the
FastAPI app rebound to use it (via env override on app.db.engine)."""
from __future__ import annotations

import os
from collections.abc import AsyncIterator

# Set the database URL BEFORE importing the app, so the engine binds to
# the in-memory sqlite for this test session.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("LOCAL_STORAGE_DIR", "./storage_test")
os.environ.setdefault("AI_BACKEND", "mock")

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.db import init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AIErrorLog, ParentChild, Profile, Problem, ReviewRecord, ReviewSchedule, Subject  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.models import Base  # noqa: E402


async def _reset_tables() -> None:
    """Wipe all rows (cheaper than drop+recreate on the same in-memory DB)."""
    async with engine.begin() as conn:
        for tbl in (
            AIErrorLog.__table__,
            ReviewRecord.__table__,
            ReviewSchedule.__table__,
            ParentChild.__table__,
            Problem.__table__,
            Profile.__table__,
            Subject.__table__,
        ):
            await conn.execute(delete(tbl))


@pytest_asyncio.fixture(autouse=True)
async def _clean_db():
    """Run once per test: reset all rows and re-seed subjects.

    The in-memory DB is shared across tests within the same event loop,
    so we wipe rows and then re-run init_db to repopulate the seed subjects.
    """
    await init_db()  # creates tables + seeds subjects (no-op after first call)
    await _reset_tables()  # wipes seeded subjects
    await init_db()  # re-seeds subjects now that the table is empty
    yield
    # no teardown needed; engine.dispose happens at session exit


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def student_profile() -> Profile:
    async with SessionLocal() as session:
        p = Profile(id="11111111-1111-1111-1111-111111111111", role="student", full_name="Taro")
        session.add(p)
        await session.commit()
        await session.refresh(p)
        return p


@pytest_asyncio.fixture
async def other_student_profile() -> Profile:
    async with SessionLocal() as session:
        p = Profile(id="22222222-2222-2222-2222-222222222222", role="student", full_name="Jiro")
        session.add(p)
        await session.commit()
        await session.refresh(p)
        return p


@pytest_asyncio.fixture
async def subjects() -> list[Subject]:
    async with SessionLocal() as session:
        rows = (await session.execute(select(Subject).order_by(Subject.id))).scalars().all()
        return list(rows)
