"""Storage adapter. Dispatches to local filesystem or Supabase Storage
based on settings.database_backend.

The public interface (save_image, delete_image) is unchanged; api/*.py
and tests import from here without knowing the backend.

Phase 1 (sqlite): local filesystem, URL scheme local://<user_id>/<filename>
Phase 2 (supabase): Supabase Storage bucket "problems", full public URL
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Final

from app.config import settings

ALLOWED_CONTENT_TYPES: Final[frozenset[str]] = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)
MAX_BYTES: Final[int] = 5 * 1024 * 1024  # 5 MB per md spec


class StorageError(ValueError):
    pass


def _ext_for(content_type: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(content_type, ".bin")


def save_image(*, user_id: str, content_type: str, data: bytes) -> str:
    """Persist `data`. Dispatches to local or Supabase Storage."""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise StorageError(f"Unsupported content type: {content_type}")
    if len(data) > MAX_BYTES:
        raise StorageError(f"File too large: {len(data)} > {MAX_BYTES} bytes")

    if settings.database_backend == "supabase":
        return _save_supabase(user_id, content_type, data)
    return _save_local(user_id, content_type, data)


def delete_image(url: str) -> None:
    """Best-effort delete. Dispatches to local or Supabase."""
    if settings.database_backend == "supabase":
        _delete_supabase(url)
    else:
        _delete_local(url)


# ---- Local filesystem backend ----

def _save_local(user_id: str, content_type: str, data: bytes) -> str:
    user_dir: Path = settings.local_storage_dir / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{_ext_for(content_type)}"
    (user_dir / name).write_bytes(data)
    return f"local://{user_id}/{name}"


def _delete_local(url: str) -> None:
    if not url.startswith("local://"):
        return
    tail = url[len("local://"):]
    path = settings.local_storage_dir / tail
    try:
        path.unlink()
    except FileNotFoundError:
        pass


# ---- Supabase Storage backend ----

SUPABASE_BUCKET: Final[str] = "problems"


def _save_supabase(user_id: str, content_type: str, data: bytes) -> str:
    from app.services.supabase_client import get_supabase

    sb = get_supabase()
    if sb is None:
        raise StorageError("Supabase client not configured")
    path = f"{user_id}/{uuid.uuid4().hex}{_ext_for(content_type)}"
    try:
        sb.storage.from_(SUPABASE_BUCKET).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as exc:
        raise StorageError(f"Supabase upload failed: {exc}") from exc
    return sb.storage.from_(SUPABASE_BUCKET).get_public_url(path)


def _delete_supabase(url: str) -> None:
    from app.services.supabase_client import get_supabase

    if "supabase" not in url.lower():
        return
    sb = get_supabase()
    if sb is None:
        return
    prefix = f"/{SUPABASE_BUCKET}/"
    idx = url.rfind(prefix)
    if idx == -1:
        return
    path = url[idx + len(prefix):]
    try:
        sb.storage.from_(SUPABASE_BUCKET).remove([path])
    except Exception:  # noqa: BLE001 — best effort
        pass
