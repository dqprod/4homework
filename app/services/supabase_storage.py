"""Supabase Storage adapter. Replaces local filesystem storage.

Bucket name: "problems" (created automatically by init, or manually in Supabase dashboard).

Returns a publicly accessible URL string matching the shape:
  https://<project>.supabase.co/storage/v1/object/public/problems/<user_id>/<filename>

Caller interface is identical to local StorageError / save_image / delete_image.
"""
from __future__ import annotations

from typing import Final

from app.services.supabase_client import get_supabase

BUCKET: Final[str] = "problems"
ALLOWED_CONTENT_TYPES: Final[frozenset[str]] = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)
MAX_BYTES: Final[int] = 5 * 1024 * 1024  # 5 MB


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
    """Upload to Supabase Storage. Returns public URL."""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise StorageError(f"Unsupported content type: {content_type}")
    if len(data) > MAX_BYTES:
        raise StorageError(f"File too large: {len(data)} > {MAX_BYTES} bytes")

    sb = get_supabase()
    if sb is None:
        raise StorageError("Supabase client not configured (set database_backend=supabase)")

    import uuid
    ext = _ext_for(content_type)
    path = f"{user_id}/{uuid.uuid4().hex}{ext}"

    try:
        result = sb.storage.from_(BUCKET).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as exc:
        raise StorageError(f"Supabase upload failed: {exc}") from exc

    # result is a dict with {'Key': ...}; public URL is predictable
    return sb.storage.from_(BUCKET).get_public_url(path)


def delete_image(url: str) -> None:
    """Best-effort delete. Silently ignores missing.

    Expects the full public URL and extracts the path after /problems/.
    """
    if "supabase" not in url.lower():
        return  # non-supabase URL, probably local:// — skip
    sb = get_supabase()
    if sb is None:
        return
    # Try to extract path: .../problems/<user_id>/<filename>
    try:
        prefix = f"/{BUCKET}/"
        idx = url.rfind(prefix)
        if idx == -1:
            return
        path = url[idx + len(prefix):]
        sb.storage.from_(BUCKET).remove([path])
    except Exception:  # noqa: BLE001 — best-effort
        pass