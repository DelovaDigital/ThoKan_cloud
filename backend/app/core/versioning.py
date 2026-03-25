from __future__ import annotations

from functools import lru_cache
import os
from pathlib import Path


@lru_cache(maxsize=1)
def get_runtime_version(default: str = "unknown") -> str:
    current_file = Path(__file__).resolve()

    candidates: list[Path] = []
    for env_name in ("THOKAN_TARGET_ROOT", "THOKAN_INSTALL_ROOT"):
        value = os.environ.get(env_name)
        if value:
            candidates.append(Path(value).expanduser())

    candidates.extend(
        [
            Path("/host_repo"),
            Path.cwd(),
        ]
    )

    seen: set[str] = set()
    for base in candidates:
        try:
            resolved = base.resolve()
        except Exception:
            continue
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        version_file = resolved / "VERSION"
        if version_file.is_file():
            version = version_file.read_text(encoding="utf-8").strip()
            if version:
                return version

    for parent in current_file.parents:
        version_file = parent / "VERSION"
        if version_file.is_file():
            version = version_file.read_text(encoding="utf-8").strip()
            if version:
                return version
    return default
