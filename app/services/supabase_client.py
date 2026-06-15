"""Shared Supabase client singleton.

Phase 2 Adapter: create one client at import time (lazy init on first
access) and reuse it across auth, storage, and DB query layers.

Usage:
    from app.services.supabase_client import get_supabase
    sb = get_supabase()
    # sb.auth.get_user(...)
    # sb.storage.from_("problems").upload(...)

Safety:
    Returns None when backend is not 'supabase', so callers always check
    before using (safe for pytest which still runs with SQLite).
"""
from __future__ import annotations

from supabase import Client, create_client

from app.config import settings

_client: Client | None = None


def get_supabase() -> Client | None:
    global _client  # noqa: PLW0603
    if _client is not None:
        return _client
    if settings.database_backend != "supabase":
        return None
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY must be set when database_backend=supabase"
        )
    _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def reset_supabase() -> None:
    """Drop the cached client (useful in tests or config reload)."""
    global _client  # noqa: PLW0603
    _client = None