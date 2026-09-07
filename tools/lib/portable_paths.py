"""Stable repository-relative paths for generated evidence."""

from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROJECT_MARKERS = (
    ".disc-work",
    "captures",
    "extracted_files",
    "extracted_disc2_v2",
    "extracted_disc3_v2",
    "play",
    "public",
    "tools",
)


def portable_project_path(value: str | Path) -> str:
    """Return a stable path without recording a contributor's checkout root."""

    path = Path(value).expanduser()
    resolved = path.resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        parts = resolved.parts
        for marker in PROJECT_MARKERS:
            if marker in parts:
                return Path(*parts[parts.index(marker):]).as_posix()
    raise ValueError(f"path is outside the project evidence roots: {path}")
