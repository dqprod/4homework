"""Runtime config. Reads env once at import. No side effects."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _split_csv(raw: str) -> list[int]:
    return [int(x.strip()) for x in raw.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./homework.db")
    )
    database_backend: str = field(
        default_factory=lambda: os.getenv("DATABASE_BACKEND", "sqlite")
    )
    supabase_url: str = field(
        default_factory=lambda: os.getenv("SUPABASE_URL", "")
    )
    supabase_key: str = field(
        default_factory=lambda: os.getenv("SUPABASE_KEY", "")
    )
    storage_backend: str = field(default_factory=lambda: os.getenv("STORAGE_BACKEND", "local"))
    local_storage_dir: Path = field(
        default_factory=lambda: Path(os.getenv("LOCAL_STORAGE_DIR", "./storage")).resolve()
    )
    ai_backend: str = field(default_factory=lambda: os.getenv("AI_BACKEND", "mock"))
    nvidia_api_base: str = field(
        default_factory=lambda: os.getenv("NVIDIA_API_BASE", "https://integrate.api.nvidia.com/v1")
    )
    nvidia_api_key: str = field(default_factory=lambda: os.getenv("NVIDIA_API_KEY", ""))
    nvidia_model: str = field(default_factory=lambda: os.getenv("NVIDIA_MODEL", "nvidia/llama-3.2-nvlm-vision-90b"))
    nvidia_timeout: int = field(default_factory=lambda: int(os.getenv("NVIDIA_TIMEOUT", "120")))
    nvidia_max_retries: int = field(default_factory=lambda: int(os.getenv("NVIDIA_MAX_RETRIES", "2")))
    ebbinghaus_intervals: list[int] = field(
        default_factory=lambda: _split_csv(os.getenv("EBBINGHAUS_INTERVALS", "1,2,4,7,15,30"))
    )
    ebbinghaus_initial_interval: int = field(
        default_factory=lambda: int(os.getenv("EBBINGHAUS_INITIAL_INTERVAL", "1"))
    )

    def __post_init__(self) -> None:
        # Ensure local storage dir exists for the local backend.
        if self.storage_backend == "local":
            self.local_storage_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
