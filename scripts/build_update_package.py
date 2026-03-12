#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import tarfile
import tempfile
from pathlib import Path


REPO_EXCLUDE_DIRS = {
    ".git",
    ".github",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "node_modules",
    "out",
    "Pods",
    "storage",
}

REPO_EXCLUDE_PATHS = {
    Path("frontend/.npm-cache"),
    Path("frontend/android/.gradle"),
    Path("frontend/android/app/build"),
    Path("frontend/ios/App/build"),
    Path("frontend/ios/App/DerivedData"),
}

REPO_EXCLUDE_FILES = {
    ".DS_Store",
}

ALLOWED_ENV_FILES = {
    ".env.example",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a ThoKan updater-compatible package")
    parser.add_argument("--channel", choices=["stable", "beta"], required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument(
        "--output-dir",
        default="dist/updates",
        help="Directory where the package archive will be written",
    )
    return parser.parse_args()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def should_skip(relative_path: Path) -> bool:
    name = relative_path.name
    if name in REPO_EXCLUDE_FILES:
        return True
    if name.startswith(".env") and name not in ALLOWED_ENV_FILES:
        return True
    if any(part in REPO_EXCLUDE_DIRS for part in relative_path.parts):
        return True
    return any(relative_path == excluded or excluded in relative_path.parents for excluded in REPO_EXCLUDE_PATHS)


def copy_repo_payload(source_root: Path, payload_root: Path) -> None:
    for source in source_root.rglob("*"):
        relative = source.relative_to(source_root)
        if should_skip(relative):
            continue
        destination = payload_root / relative
        if source.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
            continue
        if source.is_symlink():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def main() -> int:
    args = parse_args()
    root = repo_root()
    output_dir = (root / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    safe_version = "".join(ch for ch in args.version if ch.isalnum() or ch in {"-", "_", "."})
    package_name = f"thokan-cloud-{args.channel}-{safe_version}.tar.gz"
    package_path = output_dir / package_name
    update_script = root / "scripts" / "update_templates" / "update.sh"
    if not update_script.exists():
        raise FileNotFoundError(f"Missing update template: {update_script}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        staging_root = Path(tmp_dir)
        payload_root = staging_root / "payload"
        payload_root.mkdir(parents=True, exist_ok=True)

        copy_repo_payload(root, payload_root)
        shutil.copy2(update_script, staging_root / "update.sh")

        with tarfile.open(package_path, "w:gz") as archive:
            archive.add(staging_root / "update.sh", arcname="update.sh")
            archive.add(payload_root, arcname="payload")

    print(package_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())