from __future__ import annotations

import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps import get_current_user, require_admin
from app.models import SystemSetting, User

router = APIRouter()
UPDATE_STATUS_KEY = "system_update_last_status"
UPDATE_CONFIG_KEY = "system_update_config"
DEFAULT_GITHUB_UPDATE_REPO = "AlessioD200/ThoKan_cloud"
DEFAULT_GITHUB_UPDATE_BRANCH = "update-channel"
TARGET_INSTALL_ROOT = Path("/opt/thokan-cloud")
PRODUCTION_DOCKER_UPDATE_COMMAND = "sudo docker compose -f docker-compose.prod.yml up -d --build"
NOTES_CACHE_KEY = "update_notes_cache"


class StorageInfo(BaseModel):
    current_path: str
    total_gb: float
    used_gb: float
    free_gb: float
    percent_used: float


class MountPoint(BaseModel):
    path: str
    device: str
    fstype: str
    total_gb: float
    used_gb: float
    free_gb: float


class SystemInfo(BaseModel):
    hostname: str
    platform: str
    cpu_cores: int
    python_version: str
    storage: StorageInfo
    available_mounts: list[MountPoint]


class UpdatePackageInfo(BaseModel):
    name: str
    channel: str
    size_bytes: int
    modified_at: str
    release_notes: str | None = None


class UpdateStatus(BaseModel):
    state: str
    package_name: str | None = None
    channel: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    return_code: int | None = None
    stdout: str | None = None
    stderr: str | None = None
    progress: int | None = None
    progress_step: str | None = None
    release_notes: str | None = None


class AptStatus(BaseModel):
    upgradable: int
    packages: list[str]
    checked_at: str


class ApplyUpdateRequest(BaseModel):
    package_name: str
    channel: str = "stable"
    script_name: str = "update.sh"
    dry_run: bool = False
    auto_rebuild_docker: bool | None = None
    auto_update_ubuntu: bool | None = None


class UpdateConfig(BaseModel):
    selected_channel: str = "stable"
    stable_source_url: str = f"https://raw.githubusercontent.com/{DEFAULT_GITHUB_UPDATE_REPO}/{DEFAULT_GITHUB_UPDATE_BRANCH}/stable/latest.json"
    beta_source_url: str = f"https://raw.githubusercontent.com/{DEFAULT_GITHUB_UPDATE_REPO}/{DEFAULT_GITHUB_UPDATE_BRANCH}/beta/latest.json"
    auto_rebuild_docker: bool = True
    auto_update_ubuntu: bool = True
    docker_update_command: str = PRODUCTION_DOCKER_UPDATE_COMMAND
    ubuntu_update_command: str = "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade"


class FetchUpdateRequest(BaseModel):
    channel: str = "stable"


class GitHubFetchApplyRequest(BaseModel):
    repo_url: str = "https://github.com/AlessioD200/ThoKan_cloud"
    branch: str = "main"
    channel: str = "stable"
    dry_run: bool = False


def _get_notes_for_package(db: Session, package_name: str) -> str | None:
    row = db.query(SystemSetting).filter(SystemSetting.key == NOTES_CACHE_KEY).first()
    if not row or not isinstance(row.value, dict):
        return None
    return str(row.value.get(package_name) or "") or None


def _store_notes_for_package(db: Session, package_name: str, notes: str | None) -> None:
    if not notes:
        return
    row = db.query(SystemSetting).filter(SystemSetting.key == NOTES_CACHE_KEY).first()
    cache: dict = dict(row.value) if row and isinstance(row.value, dict) else {}
    if len(cache) >= 20:
        for old_key in list(cache.keys())[:-19]:
            del cache[old_key]
    cache[package_name] = notes
    if row:
        row.value = cache
    else:
        row = SystemSetting(key=NOTES_CACHE_KEY, value=cache)
        db.add(row)
    db.commit()


def _repo_install_root() -> Path:
    # file lives at <install_root>/app/api/routes/system.py
    # parents[0]=routes  [1]=api  [2]=app  [3]=<install_root>
    return Path(__file__).resolve().parents[3]


def _resolve_install_root() -> Path:
    override = os.environ.get("THOKAN_TARGET_ROOT") or os.environ.get("THOKAN_INSTALL_ROOT")
    if override:
        return Path(override).expanduser().resolve()

    repo_root = _repo_install_root()
    if repo_root.exists() and repo_root.is_dir():
        return repo_root

    return TARGET_INSTALL_ROOT


def _normalize_channel(value: str | None) -> str:
    channel = (value or "stable").strip().lower()
    return channel if channel in {"stable", "beta"} else "stable"


def _updates_dir() -> Path:
    root = Path(settings.storage_local_root) / "_system_updates"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _is_allowed_package(filename: str) -> bool:
    lower = filename.lower()
    return lower.endswith(".zip") or lower.endswith(".tar") or lower.endswith(".tar.gz") or lower.endswith(".tgz")


def _safe_name(value: str) -> str:
    return "".join(ch for ch in value if ch.isalnum() or ch in {"-", "_", "."})


def _default_update_config() -> dict:
    return UpdateConfig().model_dump()


def _normalize_update_config(raw: dict | None) -> dict:
    cfg = _default_update_config()
    if isinstance(raw, dict):
        cfg.update(raw)
    cfg["selected_channel"] = _normalize_channel(str(cfg.get("selected_channel") or "stable"))
    cfg["docker_update_command"] = PRODUCTION_DOCKER_UPDATE_COMMAND
    return cfg


def _load_update_config(db: Session) -> dict:
    row = db.query(SystemSetting).filter(SystemSetting.key == UPDATE_CONFIG_KEY).first()
    if not row or not isinstance(row.value, dict):
        return _default_update_config()
    return _normalize_update_config(row.value)


def _save_update_config(db: Session, payload: dict) -> dict:
    cfg = _normalize_update_config(payload)

    row = db.query(SystemSetting).filter(SystemSetting.key == UPDATE_CONFIG_KEY).first()
    if row:
        row.value = cfg
    else:
        row = SystemSetting(key=UPDATE_CONFIG_KEY, value=cfg)
        db.add(row)
    db.commit()
    return cfg


def _parse_package_channel(filename: str) -> str:
    parts = filename.split("_", 2)
    if len(parts) >= 3 and parts[1] in {"stable", "beta"}:
        return parts[1]
    return "manual"


def _download_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "ThoKan-Cloud-Updater/1.0"})
    with urlopen(req, timeout=45) as response:
        return response.read()


def _resolve_source_url(source_url: str) -> tuple[str, str | None, str | None]:
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Update source must be an http(s) URL")

    lower_path = parsed.path.lower()
    if lower_path.endswith(".zip") or lower_path.endswith(".tar") or lower_path.endswith(".tar.gz") or lower_path.endswith(".tgz"):
        return source_url, None, None

    if lower_path.endswith(".json"):
        raw = _download_bytes(source_url)
        try:
            manifest = json.loads(raw.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid update manifest JSON") from exc

        package_url = str(manifest.get("package_url") or "").strip()
        if not package_url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manifest is missing package_url")
        version = str(manifest.get("version") or "").strip() or None
        notes = str(manifest.get("notes") or "").strip() or None
        return package_url, version, notes

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Source URL must point to an archive file or a manifest .json",
    )


def _run_shell_command(command: str, timeout_seconds: int = 3600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", "-lc", command],
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )


def _run_shell_command_in_root(command: str, timeout_seconds: int = 3600) -> subprocess.CompletedProcess[str]:
    target_root = _resolve_install_root()
    if not target_root.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target install root not found: {target_root}",
        )
    return subprocess.run(
        ["bash", "-lc", command],
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        cwd=str(target_root),
    )


@router.post("/update/fetch-and-apply-github", response_model=UpdateStatus)
def fetch_and_apply_github(
    payload: GitHubFetchApplyRequest,
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clone a GitHub repo, build an update package (update.sh + payload/), and run the update script.

    The package will be stored in the server updates directory and applied immediately.
    """
    channel = _normalize_channel(payload.channel)
    update_dir = _updates_dir()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe_branch = _safe_name(payload.branch)
    parsed = urlparse(payload.repo_url)
    repo_name = _safe_name(Path(parsed.path).stem) or "repo"
    target_name = f"{timestamp}_{channel}_{repo_name}.tar.gz"
    target_path = update_dir / target_name

    started_at = datetime.now(timezone.utc).isoformat()
    _save_update_status(
        db,
        {
            "state": "running",
            "package_name": target_name,
            "channel": channel,
            "started_at": started_at,
            "finished_at": None,
            "return_code": None,
            "stdout": "",
            "stderr": "",
        },
    )

    try:
        with tempfile.TemporaryDirectory(dir=str(update_dir)) as tmpdir:
            tmp = Path(tmpdir)
            repo_dir = tmp / "repo"

            git_cmd = f"git clone --depth 1 --branch {payload.branch} {payload.repo_url} {repo_dir}"
            git_result = _run_shell_command(git_cmd, timeout_seconds=600)
            if git_result.returncode != 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Git clone failed: {git_result.stderr}")

            # Prepare package layout: update.sh at root, payload/ contains repo files
            payload_dir = tmp / "package_payload"
            payload_dir.mkdir(parents=True, exist_ok=True)

            # Copy repo contents into payload/
            if shutil.which("rsync"):
                rsync_cmd = f"rsync -a --delete {repo_dir}/ {payload_dir}/"
                rsync_result = _run_shell_command(rsync_cmd)
                if rsync_result.returncode != 0:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to prepare payload: {rsync_result.stderr}")
            else:
                shutil.copytree(str(repo_dir), str(payload_dir), dirs_exist_ok=True)

            # Write a simple update.sh that mirrors expected structure
            update_sh = tmp / "update.sh"
            update_sh.write_text(
                """#!/usr/bin/env bash
set -euo pipefail
CHANNEL="${THOKAN_UPDATE_CHANNEL:-stable}"
DRY_RUN="${THOKAN_DRY_RUN:-0}"
TARGET_ROOT="${THOKAN_TARGET_ROOT:-/opt/thokan-cloud}"
PAYLOAD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/payload"

echo "[ThoKan update] channel=${CHANNEL} dry_run=${DRY_RUN}"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "[ThoKan update] DRY RUN: would sync payload to ${TARGET_ROOT}"
  echo "rsync -a --delete ${PAYLOAD_DIR}/ ${TARGET_ROOT}/"
  exit 0
fi

if [[ ! -d "${TARGET_ROOT}" ]]; then
  echo "[ThoKan update] ERROR: target root does not exist: ${TARGET_ROOT}" >&2
  exit 1
fi

echo "[ThoKan update] Syncing payload to ${TARGET_ROOT}..."
if command -v rsync &>/dev/null; then
  rsync -a --delete --ignore-errors "${PAYLOAD_DIR}/" "${TARGET_ROOT}/"
else
  echo "[ThoKan update] rsync not found, falling back to cp"
  cp -a "${PAYLOAD_DIR}/." "${TARGET_ROOT}/"
fi

echo "[ThoKan update] Package payload applied successfully."
""",
                encoding="utf-8",
            )

            # Create tar.gz with update.sh and payload/
            import tarfile as _tar

            with _tar.open(target_path, "w:gz") as tarf:
                tarf.add(str(update_sh), arcname="update.sh")
                tarf.add(str(payload_dir), arcname="payload")

            # Now execute update.sh similarly to apply_update_package (but without docker/ubuntu post-steps)
            with tempfile.TemporaryDirectory(dir=str(update_dir)) as extract_tmp:
                extract_path = Path(extract_tmp)
                with tarfile.open(target_path, "r:gz") as archive:
                    _safe_extract_tar(archive, extract_path)

                script_path = (extract_path / "update.sh").resolve()
                env = os.environ.copy()
                env["THOKAN_DRY_RUN"] = "1" if payload.dry_run else "0"
                env["THOKAN_UPDATE_CHANNEL"] = channel
                env["THOKAN_TARGET_ROOT"] = str(_resolve_install_root())

                result = subprocess.run(["bash", str(script_path)], cwd=str(extract_path), capture_output=True, text=True, env=env, timeout=1800)

                finished_at = datetime.now(timezone.utc).isoformat()
                status_payload = {
                    "state": "success" if result.returncode == 0 else "failed",
                    "package_name": target_name,
                    "channel": channel,
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "return_code": result.returncode,
                    "stdout": (result.stdout or "")[-10000:],
                    "stderr": (result.stderr or "")[-10000:],
                }
                _save_update_status(db, status_payload)
                return UpdateStatus(**status_payload)

    except HTTPException:
        raise
    except Exception as exc:
        finished_at = datetime.now(timezone.utc).isoformat()
        status_payload = {
            "state": "failed",
            "package_name": target_name,
            "channel": channel,
            "started_at": started_at,
            "finished_at": finished_at,
            "return_code": -1,
            "stdout": "",
            "stderr": str(exc),
        }
        _save_update_status(db, status_payload)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Fetch & apply failed: {exc}") from exc


@router.post("/update/restart", response_model=dict)
def restart_docker_after_update(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Run the production docker-compose rebuild command. Returns the command output."""
    cfg = _load_update_config(db)
    docker_cmd = str(cfg.get("docker_update_command") or PRODUCTION_DOCKER_UPDATE_COMMAND)

    try:
        result = _run_shell_command_in_root(docker_cmd, timeout_seconds=3600)
        return {
            "return_code": result.returncode,
            "stdout": (result.stdout or "")[-20000:],
            "stderr": (result.stderr or "")[-20000:],
        }
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Restart failed: {exc}") from exc


def _save_update_status(db: Session, payload: dict) -> None:
    row = db.query(SystemSetting).filter(SystemSetting.key == UPDATE_STATUS_KEY).first()
    if row:
        row.value = payload
    else:
        row = SystemSetting(key=UPDATE_STATUS_KEY, value=payload)
        db.add(row)
    db.commit()


def _safe_extract_zip(archive: zipfile.ZipFile, target: Path) -> None:
    target_resolved = target.resolve()
    for member in archive.namelist():
        member_path = (target / member).resolve()
        if target_resolved != member_path and target_resolved not in member_path.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid archive content")
    archive.extractall(target)


def _safe_extract_tar(archive: tarfile.TarFile, target: Path) -> None:
    target_resolved = target.resolve()
    for member in archive.getmembers():
        member_path = (target / member.name).resolve()
        if target_resolved != member_path and target_resolved not in member_path.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid archive content")
    archive.extractall(target)


@router.get("/info", response_model=SystemInfo)
def get_system_info(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
):
    storage_path = Path(settings.storage_local_root)
    storage_path.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(storage_path)

    gib = 1024**3
    total_gb = usage.total / gib
    used_gb = usage.used / gib
    free_gb = usage.free / gib

    # Get available mount points (Unix-like systems)
    mounts: list[MountPoint] = []
    if os.path.exists("/proc/mounts"):
        try:
            with open("/proc/mounts") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 3:
                        device, mount_path, fstype = parts[0], parts[1], parts[2]
                        # Filter to physical/useful mounts
                        if mount_path.startswith(("/mnt", "/media", "/home", "/data", "/storage")) or mount_path == "/":
                            try:
                                mount_usage = shutil.disk_usage(mount_path)
                                mounts.append(
                                    MountPoint(
                                        path=mount_path,
                                        device=device,
                                        fstype=fstype,
                                        total_gb=round(mount_usage.total / gib, 2),
                                        used_gb=round(mount_usage.used / gib, 2),
                                        free_gb=round(mount_usage.free / gib, 2),
                                    )
                                )
                            except (PermissionError, OSError):
                                pass
        except Exception:
            pass

    return SystemInfo(
        hostname=platform.node(),
        platform=platform.platform(),
        cpu_cores=os.cpu_count() or 1,
        python_version=platform.python_version(),
        storage=StorageInfo(
            current_path=str(storage_path),
            total_gb=round(total_gb, 2),
            used_gb=round(used_gb, 2),
            free_gb=round(free_gb, 2),
            percent_used=round((used_gb / total_gb) * 100, 2) if total_gb > 0 else 0,
        ),
        available_mounts=mounts,
    )


class UpdateStoragePathRequest(BaseModel):
    new_path: str


@router.post("/storage-path")
def update_storage_path(
    payload: UpdateStoragePathRequest,
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update the storage path (requires restart to take effect)."""
    path = Path(payload.new_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path does not exist")
    if not path.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path is not a directory")

    # Store in system settings
    setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_path").first()
    if setting:
        setting.value = payload.new_path
    else:
        setting = SystemSetting(key="storage_path", value=payload.new_path)
        db.add(setting)
    db.commit()

    return {
        "message": "Storage path updated. Restart the backend service to apply changes.",
        "new_path": payload.new_path,
    }


@router.get("/update/packages", response_model=list[UpdatePackageInfo])
def list_update_packages(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
):
    update_dir = _updates_dir()
    packages: list[UpdatePackageInfo] = []

    for item in sorted(update_dir.iterdir(), key=lambda path: path.stat().st_mtime, reverse=True):
        if item.is_file() and _is_allowed_package(item.name):
            stat = item.stat()
            packages.append(
                UpdatePackageInfo(
                    name=item.name,
                    channel=_parse_package_channel(item.name),
                    size_bytes=stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                )
            )
    return packages


@router.get("/update/config", response_model=UpdateConfig)
def get_update_config(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return UpdateConfig(**_load_update_config(db))


@router.put("/update/config", response_model=UpdateConfig)
def save_update_config(
    payload: UpdateConfig,
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return UpdateConfig(**_save_update_config(db, payload.model_dump()))


@router.post("/update/upload")
def upload_update_package(
    upload: UploadFile = File(...),
    channel: str = Form("stable"),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
):
    if not upload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")

    safe_original = _safe_name(upload.filename)
    if not safe_original or not _is_allowed_package(safe_original):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .zip, .tar, .tar.gz and .tgz are allowed")

    normalized_channel = _normalize_channel(channel)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    target_name = f"{timestamp}_{normalized_channel}_{safe_original}"
    target_path = _updates_dir() / target_name

    with target_path.open("wb") as destination:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            destination.write(chunk)

    return {
        "message": "Update package uploaded",
        "channel": normalized_channel,
        "package_name": target_name,
    }


@router.post("/update/fetch-latest", response_model=UpdatePackageInfo)
def fetch_latest_update_package(
    payload: FetchUpdateRequest,
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    channel = _normalize_channel(payload.channel)
    cfg = _load_update_config(db)
    source_url_value = cfg.get("stable_source_url") if channel == "stable" else cfg.get("beta_source_url")
    source_url = str(source_url_value or "").strip()
    if not source_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No source URL configured for {channel} channel")

    package_url, version, notes = _resolve_source_url(source_url)
    parsed = urlparse(package_url)
    original_name = _safe_name(Path(parsed.path).name)
    if not original_name or not _is_allowed_package(original_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resolved package URL is not a supported archive")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    version_part = f"{_safe_name(version)}_" if version else ""
    target_name = f"{timestamp}_{channel}_{version_part}{original_name}"
    target_path = _updates_dir() / target_name

    try:
        content = _download_bytes(package_url)
        with target_path.open("wb") as destination:
            destination.write(content)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to download update package: {exc}") from exc

    stat = target_path.stat()
    _store_notes_for_package(db, target_name, notes)
    return UpdatePackageInfo(
        name=target_name,
        channel=channel,
        size_bytes=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        release_notes=notes,
    )


@router.get("/update/status", response_model=UpdateStatus)
def get_update_status(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(SystemSetting).filter(SystemSetting.key == UPDATE_STATUS_KEY).first()
    if not row or not isinstance(row.value, dict):
        return UpdateStatus(state="idle")
    return UpdateStatus(**row.value)


@router.post("/update/apply", response_model=UpdateStatus)
def apply_update_package(
    payload: ApplyUpdateRequest,
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    channel = _normalize_channel(payload.channel)
    cfg = _load_update_config(db)

    update_dir = _updates_dir()
    package_name = _safe_name(payload.package_name)
    if not package_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package name")

    package_path = (update_dir / package_name).resolve()
    if not package_path.exists() or update_dir.resolve() not in package_path.parents:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update package not found")

    extraction_base = update_dir / "extracted"
    extraction_base.mkdir(parents=True, exist_ok=True)

    started_at = datetime.now(timezone.utc).isoformat()
    release_notes = _get_notes_for_package(db, package_name)
    running_status: dict = {
        "state": "running",
        "package_name": package_name,
        "channel": channel,
        "started_at": started_at,
        "finished_at": None,
        "return_code": None,
        "stdout": "",
        "stderr": "",
        "progress": 5,
        "progress_step": "Pakket uitpakken...",
        "release_notes": release_notes,
    }
    _save_update_status(db, running_status)

    try:
        with tempfile.TemporaryDirectory(dir=extraction_base) as tmp_dir:
            extract_path = Path(tmp_dir)

            if zipfile.is_zipfile(package_path):
                with zipfile.ZipFile(package_path, "r") as archive:
                    _safe_extract_zip(archive, extract_path)
            elif tarfile.is_tarfile(package_path):
                with tarfile.open(package_path, "r:*") as archive:
                    _safe_extract_tar(archive, extract_path)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported update package format")

            running_status.update({"progress": 20, "progress_step": "Update script uitvoeren..."})
            _save_update_status(db, running_status)

            script_name = _safe_name(payload.script_name)
            if not script_name:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid script name")

            script_path = (extract_path / script_name).resolve()
            if not script_path.exists() or extract_path not in script_path.parents:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Update script '{script_name}' not found in package root",
                )

            if script_path.name == "update.sh":
                try:
                    script_content = script_path.read_text(encoding="utf-8")
                    if "TARGET_ROOT=\"/opt/thokan-cloud\"" in script_content and "THOKAN_TARGET_ROOT" not in script_content:
                        script_path.write_text(
                            script_content.replace(
                                'TARGET_ROOT="/opt/thokan-cloud"',
                                'TARGET_ROOT="${THOKAN_TARGET_ROOT:-/opt/thokan-cloud}"',
                            ),
                            encoding="utf-8",
                        )
                except Exception:
                    pass

            env = os.environ.copy()
            env["THOKAN_DRY_RUN"] = "1" if payload.dry_run else "0"
            env["THOKAN_UPDATE_CHANNEL"] = channel
            env["THOKAN_TARGET_ROOT"] = str(_resolve_install_root())

            result = subprocess.run(
                ["bash", str(script_path)],
                cwd=str(extract_path),
                capture_output=True,
                text=True,
                timeout=1800,
                env=env,
            )

            auto_rebuild_docker = cfg.get("auto_rebuild_docker", True) if payload.auto_rebuild_docker is None else payload.auto_rebuild_docker
            auto_update_ubuntu = cfg.get("auto_update_ubuntu", False) if payload.auto_update_ubuntu is None else payload.auto_update_ubuntu

            post_stdout: list[str] = []
            post_stderr: list[str] = []

            if result.returncode == 0 and not payload.dry_run and auto_rebuild_docker:
                running_status.update({"progress": 50, "progress_step": "Docker services herstartten..."})
                _save_update_status(db, running_status)
                docker_command = str(cfg.get("docker_update_command") or PRODUCTION_DOCKER_UPDATE_COMMAND)
                docker_result = _run_shell_command_in_root(docker_command)
                post_stdout.append(f"\n[Docker rebuild]\n{docker_result.stdout or ''}")
                post_stderr.append(f"\n[Docker rebuild]\n{docker_result.stderr or ''}")
                if docker_result.returncode != 0:
                    result = subprocess.CompletedProcess(
                        args=result.args,
                        returncode=docker_result.returncode,
                        stdout=(result.stdout or "") + "".join(post_stdout),
                        stderr=(result.stderr or "") + "".join(post_stderr),
                    )

            if result.returncode == 0 and not payload.dry_run and auto_update_ubuntu:
                running_status.update({"progress": 80, "progress_step": "Systeempakketten bijwerken..."})
                _save_update_status(db, running_status)
                ubuntu_command = str(cfg.get("ubuntu_update_command") or "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade")
                ubuntu_result = _run_shell_command(ubuntu_command)
                post_stdout.append(f"\n[Ubuntu updates]\n{ubuntu_result.stdout or ''}")
                post_stderr.append(f"\n[Ubuntu updates]\n{ubuntu_result.stderr or ''}")
                if ubuntu_result.returncode != 0:
                    result = subprocess.CompletedProcess(
                        args=result.args,
                        returncode=ubuntu_result.returncode,
                        stdout=(result.stdout or "") + "".join(post_stdout),
                        stderr=(result.stderr or "") + "".join(post_stderr),
                    )

            finished_at = datetime.now(timezone.utc).isoformat()
            status_payload = {
                "state": "success" if result.returncode == 0 else "failed",
                "package_name": package_name,
                "channel": channel,
                "started_at": started_at,
                "finished_at": finished_at,
                "return_code": result.returncode,
                "stdout": (result.stdout or "")[-10000:],
                "stderr": (result.stderr or "")[-10000:],
                "progress": 100,
                "progress_step": "Voltooid" if result.returncode == 0 else "Mislukt",
                "release_notes": release_notes,
            }
            _save_update_status(db, status_payload)
            return UpdateStatus(**status_payload)

    except HTTPException as exc:
        finished_at = datetime.now(timezone.utc).isoformat()
        status_payload = {
            "state": "failed",
            "package_name": package_name,
            "channel": channel,
            "started_at": started_at,
            "finished_at": finished_at,
            "return_code": -1,
            "stdout": "",
            "stderr": exc.detail,
        }
        _save_update_status(db, status_payload)
        raise
    except Exception as exc:
        finished_at = datetime.now(timezone.utc).isoformat()
        status_payload = {
            "state": "failed",
            "package_name": package_name,
            "channel": channel,
            "started_at": started_at,
            "finished_at": finished_at,
            "return_code": -1,
            "stdout": "",
            "stderr": str(exc),
        }
        _save_update_status(db, status_payload)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Update failed: {exc}") from exc


def _list_apt_upgradable() -> list[str]:
    try:
        result = subprocess.run(
            ["apt", "list", "--upgradable"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return [
            line.strip()
            for line in result.stdout.splitlines()
            if line.strip() and not line.lower().startswith("listing")
        ]
    except FileNotFoundError:
        return []


@router.get("/update/apt-status", response_model=AptStatus)
def get_apt_status(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
):
    """Return currently-known upgradable Debian/Ubuntu packages (uses cached apt index)."""
    return AptStatus(
        upgradable=len(lines := _list_apt_upgradable()),
        packages=lines[:100],
        checked_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/update/apt-refresh", response_model=AptStatus)
def refresh_apt_status(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
):
    """Run apt-get update to refresh package index, then return upgradable list."""
    try:
        subprocess.run(["apt-get", "update", "-qq"], capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        pass
    lines = _list_apt_upgradable()
    return AptStatus(
        upgradable=len(lines),
        packages=lines[:100],
        checked_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/update/apt-upgrade", response_model=UpdateStatus)
def apt_upgrade(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Run apt-get update + apt-get upgrade on the host system."""
    cfg = _load_update_config(db)
    ubuntu_command = str(cfg.get("ubuntu_update_command") or "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade")
    started_at = datetime.now(timezone.utc).isoformat()
    _save_update_status(
        db,
        {
            "state": "running",
            "package_name": None,
            "channel": "system",
            "started_at": started_at,
            "finished_at": None,
            "return_code": None,
            "stdout": "",
            "stderr": "",
            "progress": 10,
            "progress_step": "Systeempakketten bijwerken...",
        },
    )
    try:
        result = _run_shell_command(ubuntu_command, timeout_seconds=1800)
        finished_at = datetime.now(timezone.utc).isoformat()
        status_payload = {
            "state": "success" if result.returncode == 0 else "failed",
            "package_name": None,
            "channel": "system",
            "started_at": started_at,
            "finished_at": finished_at,
            "return_code": result.returncode,
            "stdout": (result.stdout or "")[-10000:],
            "stderr": (result.stderr or "")[-10000:],
            "progress": 100,
            "progress_step": "Systeempakketten bijgewerkt" if result.returncode == 0 else "Mislukt",
        }
        _save_update_status(db, status_payload)
        return UpdateStatus(**status_payload)
    except Exception as exc:
        finished_at = datetime.now(timezone.utc).isoformat()
        status_payload = {
            "state": "failed",
            "package_name": None,
            "channel": "system",
            "started_at": started_at,
            "finished_at": finished_at,
            "return_code": -1,
            "stdout": "",
            "stderr": str(exc),
            "progress": None,
            "progress_step": "Mislukt",
        }
        _save_update_status(db, status_payload)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"apt-upgrade failed: {exc}") from exc
