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
from app.core.versioning import get_runtime_version
from app.db.session import get_db
from app.deps import get_current_user, require_admin
from app.models import SystemSetting, User

router = APIRouter()
UPDATE_STATUS_KEY = "system_update_last_status"
UPDATE_CONFIG_KEY = "system_update_config"
DEFAULT_GITHUB_UPDATE_REPO = "AlessioD200/ThoKan_cloud"
DEFAULT_GITHUB_UPDATE_BRANCH = "update-channel"
TARGET_INSTALL_ROOT = Path("/opt/thokan-cloud")
PRODUCTION_DOCKER_UPDATE_COMMAND = "if command -v docker >/dev/null 2>&1; then docker restart \"$(hostname)\" && echo '[ThoKan update] backend herstart via docker restart'; else echo '[ThoKan update] docker command not found, skipping backend restart.'; fi"
NOTES_CACHE_KEY = "update_notes_cache"
VERSION_CACHE_KEY = "update_version_cache"
INSTALLED_UPDATE_KEY = "system_update_installed"


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
    version: str | None = None


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
    installed_package_name: str | None = None
    installed_build_date: str | None = None
    installed_version: str | None = None


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
    auto_check_updates: bool = True
    auto_install_nightly: bool = False
    nightly_install_hour: int = 3
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
    auto_rebuild_docker: bool | None = None
    auto_update_ubuntu: bool | None = None


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


def _get_version_for_package(db: Session, package_name: str) -> str | None:
    row = db.query(SystemSetting).filter(SystemSetting.key == VERSION_CACHE_KEY).first()
    if not row or not isinstance(row.value, dict):
        return None
    return str(row.value.get(package_name) or "") or None


def _store_version_for_package(db: Session, package_name: str, version: str | None) -> None:
    if not version:
        return
    row = db.query(SystemSetting).filter(SystemSetting.key == VERSION_CACHE_KEY).first()
    cache: dict = dict(row.value) if row and isinstance(row.value, dict) else {}
    if len(cache) >= 20:
        for old_key in list(cache.keys())[:-19]:
            del cache[old_key]
    cache[package_name] = version
    if row:
        row.value = cache
    else:
        row = SystemSetting(key=VERSION_CACHE_KEY, value=cache)
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
    if repo_root.exists() and repo_root.is_dir() and repo_root != Path("/app"):
        return repo_root

    return TARGET_INSTALL_ROOT


def _normalize_channel(value: str | None) -> str:
    channel = (value or "stable").strip().lower()
    return channel if channel in {"stable", "beta"} else "stable"


def _normalize_version_for_compare(value: str | None) -> str | None:
    if not value:
        return None
    normalized = str(value).strip().lower()
    if not normalized:
        return None
    if normalized.startswith("v"):
        normalized = normalized[1:]
    if "+" in normalized:
        normalized = normalized.split("+", 1)[0]
    return normalized or None


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
    try:
        cfg["nightly_install_hour"] = max(0, min(23, int(cfg.get("nightly_install_hour", 3))))
    except Exception:
        cfg["nightly_install_hour"] = 3
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
    """Clone a GitHub repo, build an updater package and apply it via the same pipeline as cloud packages.

    This keeps git-based updates and cloud updates behaviorally identical.
    """
    channel = _normalize_channel(payload.channel)
    update_dir = _updates_dir()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    parsed = urlparse(payload.repo_url)
    repo_name = _safe_name(Path(parsed.path).stem) or "repo"
    safe_branch = _safe_name(payload.branch) or "main"
    target_name = f"{timestamp}_{channel}_{repo_name}_{safe_branch}.tar.gz"
    target_path = update_dir / target_name

    try:
        with tempfile.TemporaryDirectory(dir=str(update_dir)) as tmpdir:
            tmp = Path(tmpdir)
            repo_dir = tmp / "repo"

            git_cmd = f"git clone --depth 1 --branch {payload.branch} {payload.repo_url} {repo_dir}"
            git_result = _run_shell_command(git_cmd, timeout_seconds=600)
            if git_result.returncode != 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Git clone failed: {git_result.stderr}")

            sync_script = repo_dir / "scripts" / "sync_version.py"
            if sync_script.exists():
                sync_result = subprocess.run(
                    ["python3", str(sync_script)],
                    cwd=str(repo_dir),
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
                if sync_result.returncode != 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Version sync failed in cloned repo: {sync_result.stderr or sync_result.stdout}",
                    )

            payload_dir = tmp / "package_payload"
            payload_dir.mkdir(parents=True, exist_ok=True)

            if shutil.which("rsync"):
                rsync_cmd = f"rsync -a --delete {repo_dir}/ {payload_dir}/"
                rsync_result = _run_shell_command(rsync_cmd)
                if rsync_result.returncode != 0:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to prepare payload: {rsync_result.stderr}")
            else:
                shutil.copytree(str(repo_dir), str(payload_dir), dirs_exist_ok=True)

            repo_version = ""
            version_file = repo_dir / "VERSION"
            if version_file.exists():
                repo_version = version_file.read_text(encoding="utf-8").strip()

            semver = repo_version.split("+", 1)[0].strip() if repo_version else ""
            build_meta = f"{timestamp}-{safe_branch}"
            commit_result = subprocess.run(
                ["git", "-C", str(repo_dir), "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            git_commit = commit_result.stdout.strip() if commit_result.returncode == 0 else ""
            version_info = {
                "app_version": semver or None,
                "build": build_meta,
                "full_version": f"{semver}+{build_meta}" if semver else build_meta,
                "source": "git",
                "repo_url": payload.repo_url,
                "branch": payload.branch,
                "git_commit": git_commit or None,
            }
            (payload_dir / "version.json").write_text(json.dumps(version_info, indent=2), encoding="utf-8")

            update_sh = tmp / "update.sh"
            template_update_sh = repo_dir / "scripts" / "update_templates" / "update.sh"
            if template_update_sh.exists():
                update_sh.write_text(template_update_sh.read_text(encoding="utf-8"), encoding="utf-8")
            else:
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
  echo "rsync -a --delete --ignore-errors --exclude storage/ ${PAYLOAD_DIR}/ ${TARGET_ROOT}/"
  exit 0
fi

if [[ ! -d "${TARGET_ROOT}" ]]; then
  echo "[ThoKan update] ERROR: target root does not exist: ${TARGET_ROOT}" >&2
  exit 1
fi

echo "[ThoKan update] Syncing payload to ${TARGET_ROOT}..."
if command -v rsync &>/dev/null; then
  rsync -a --delete --ignore-errors --exclude ".env" --exclude "storage/" --exclude "docker/ssl/" --exclude ".git/" --exclude ".venv/" --exclude "node_modules/" --exclude ".next/" --exclude "__pycache__/" --exclude "*.pyc" "${PAYLOAD_DIR}/" "${TARGET_ROOT}/" || { rc=$?; [[ $rc -eq 23 || $rc -eq 24 ]] || exit $rc; }
else
  echo "[ThoKan update] rsync not found, falling back to cp"
  cp -a "${PAYLOAD_DIR}/." "${TARGET_ROOT}/"
fi

echo "[ThoKan update] Package payload applied successfully."
""",
                    encoding="utf-8",
                )

            import tarfile as _tar

            with _tar.open(target_path, "w:gz") as tarf:
                tarf.add(str(update_sh), arcname="update.sh")
                tarf.add(str(payload_dir), arcname="payload")

            return apply_update_package(
                ApplyUpdateRequest(
                    package_name=target_name,
                    channel=channel,
                    script_name="update.sh",
                    dry_run=payload.dry_run,
                    auto_rebuild_docker=payload.auto_rebuild_docker,
                    auto_update_ubuntu=payload.auto_update_ubuntu,
                ),
                current_user=current_user,
                _=current_user,
                db=db,
            )

    except HTTPException:
        raise
    except Exception as exc:
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


def _extract_build_date(package_name: str | None) -> str | None:
    if not package_name:
        return None
    head = package_name.split("_", 1)[0]
    if len(head) >= 8 and head[:8].isdigit():
        return f"{head[:4]}-{head[4:6]}-{head[6:8]}"
    return None


def _get_installed_update(db: Session) -> dict:
    runtime_version = get_runtime_version(default="") or None
    row = db.query(SystemSetting).filter(SystemSetting.key == INSTALLED_UPDATE_KEY).first()
    if not row or not isinstance(row.value, dict):
        return {
            "installed_package_name": None,
            "installed_build_date": None,
            "installed_version": runtime_version,
        }
    package_name = str(row.value.get("package_name") or "") or None
    build_date = str(row.value.get("build_date") or "") or _extract_build_date(package_name)
    stored_version = str(row.value.get("version") or "") or None
    installed_version = runtime_version or stored_version
    return {
        "installed_package_name": package_name,
        "installed_build_date": build_date,
        "installed_version": installed_version,
    }


def _save_installed_update(db: Session, package_name: str, version: str | None = None) -> dict:
    value = {
        "package_name": package_name,
        "build_date": _extract_build_date(package_name),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
    }
    row = db.query(SystemSetting).filter(SystemSetting.key == INSTALLED_UPDATE_KEY).first()
    if row:
        row.value = value
    else:
        row = SystemSetting(key=INSTALLED_UPDATE_KEY, value=value)
        db.add(row)
    db.commit()
    return {
        "installed_package_name": value["package_name"],
        "installed_build_date": value["build_date"],
        "installed_version": version,
    }


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
    db: Session = Depends(get_db),
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
                    version=_get_version_for_package(db, item.name),
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


@router.post("/update/check-latest")
def check_latest_update(
    payload: FetchUpdateRequest,
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Read the remote manifest and return version info without downloading the package."""
    channel = _normalize_channel(payload.channel)
    cfg = _load_update_config(db)
    source_url_value = cfg.get("stable_source_url") if channel == "stable" else cfg.get("beta_source_url")
    source_url = str(source_url_value or "").strip()
    if not source_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No source URL configured for {channel} channel")

    _package_url, version, notes = _resolve_source_url(source_url)
    installed = _get_installed_update(db)
    installed_version = installed.get("installed_version")
    latest_norm = _normalize_version_for_compare(version)
    installed_norm = _normalize_version_for_compare(installed_version)
    up_to_date = bool(latest_norm and installed_norm and latest_norm == installed_norm)
    return {
        "channel": channel,
        "version": version,
        "notes": notes,
        "installed_version": installed_version,
        "up_to_date": up_to_date,
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
    _store_version_for_package(db, target_name, version)
    return UpdatePackageInfo(
        name=target_name,
        channel=channel,
        size_bytes=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        release_notes=notes,
        version=version,
    )


@router.get("/update/status", response_model=UpdateStatus)
def get_update_status(
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    installed = _get_installed_update(db)
    row = db.query(SystemSetting).filter(SystemSetting.key == UPDATE_STATUS_KEY).first()
    if not row or not isinstance(row.value, dict):
        return UpdateStatus(state="idle", **installed)
    merged = dict(row.value)
    merged.update(installed)
    return UpdateStatus(**merged)


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
        "progress": 0,
        "progress_step": "Update gestart...",
        "release_notes": release_notes,
    }
    _save_update_status(db, running_status)

    try:
        with tempfile.TemporaryDirectory(prefix="thokan-update-") as tmp_dir:
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
                    import re as _re
                    script_content = script_path.read_text(encoding="utf-8")
                    patched = script_content
                    # Fix hard-coded install root in old packages
                    if 'TARGET_ROOT="/opt/thokan-cloud"' in patched and "THOKAN_TARGET_ROOT" not in patched:
                        patched = patched.replace(
                            'TARGET_ROOT="/opt/thokan-cloud"',
                            'TARGET_ROOT="${THOKAN_TARGET_ROOT:-/opt/thokan-cloud}"',
                        )
                    # Replace any rsync --delete call that is missing the full exclude set.
                    # Matches lines like: rsync -a --delete [options] "${PAYLOAD_DIR}/" "${TARGET_ROOT}/"
                    full_rsync = (
                        'rsync -a --delete --ignore-errors'
                        ' --exclude ".env" --exclude "storage/" --exclude "docker/ssl/" --exclude ".git/" --exclude ".venv/"'
                        ' --exclude "node_modules/" --exclude ".next/" --exclude "__pycache__/" --exclude "*.pyc"'
                        ' "${PAYLOAD_DIR}/" "${TARGET_ROOT}/"'
                        ' || { rc=$?; [[ $rc -eq 23 || $rc -eq 24 ]] || exit $rc; }'
                    )
                    patched = _re.sub(
                        r'rsync\s+-a\s+--delete.*?"\$\{PAYLOAD_DIR\}/"\s+"\$\{TARGET_ROOT\}/"'
                        r'(?:\s*\|\|\s*\{[^}]*\})?',
                        full_rsync,
                        patched,
                    )
                    if patched != script_content:
                        script_path.write_text(patched, encoding="utf-8")
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
            package_git_commit: str | None = None

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

            if result.returncode == 0 and not payload.dry_run:
                try:
                    import json as _json
                    import re as _re

                    version_file = extract_path / "payload" / "version.json"
                    if version_file.exists():
                        metadata = _json.loads(version_file.read_text())
                        possible_commit = str(metadata.get("git_commit") or "").strip()
                        if possible_commit and _re.fullmatch(r"[0-9a-fA-F]{7,40}", possible_commit):
                            package_git_commit = possible_commit
                except Exception:
                    package_git_commit = None

            if result.returncode == 0 and not payload.dry_run and package_git_commit:
                target_root = _resolve_install_root()
                if (target_root / ".git").exists():
                    running_status.update({"progress": 90, "progress_step": "Git werkmap synchroniseren..."})
                    _save_update_status(db, running_status)
                    sync_result = _run_shell_command_in_root(
                        f"git fetch --all --prune && git reset --hard {package_git_commit} && git clean -fd",
                        timeout_seconds=300,
                    )
                    post_stdout.append(f"\n[Git sync]\n{sync_result.stdout or ''}")
                    post_stderr.append(f"\n[Git sync]\n{sync_result.stderr or ''}")
                    if sync_result.returncode != 0:
                        result = subprocess.CompletedProcess(
                            args=result.args,
                            returncode=sync_result.returncode,
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
            if result.returncode == 0 and not payload.dry_run:
                # Try to read the semantic version embedded in the package
                pkg_version: str | None = None
                try:
                    version_file = extract_path / "payload" / "version.json"
                    if version_file.exists():
                        import json as _json
                        pkg_version = (_json.loads(version_file.read_text()) or {}).get("app_version")
                except Exception:
                    pass
                if pkg_version is None:
                    pkg_version = _get_version_for_package(db, package_name)
                status_payload.update(_save_installed_update(db, package_name, pkg_version))
            else:
                status_payload.update(_get_installed_update(db))
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
        status_payload.update(_get_installed_update(db))
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
        status_payload.update(_get_installed_update(db))
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
