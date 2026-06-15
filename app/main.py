"""FastAPI app entry. `uvicorn app.main:app` to run."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import parent, problems, profiles, reviews, subjects, upload
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    await init_db()
    yield


app = FastAPI(
    title="4homework MVP API",
    version="0.1.0",
    description=(
        "Phase 1 MVP. SQLite + mock AI + header-based auth. "
        "Supabase / JWT / real Nvidia client come in Phase 2."
    ),
    lifespan=lifespan,
)

app.include_router(subjects.router)
app.include_router(upload.router)
app.include_router(problems.router)
app.include_router(reviews.router)
app.include_router(parent.router)
app.include_router(profiles.router)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
