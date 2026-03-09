import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps import get_current_user, require_admin
from app.models import SystemSetting, User

router = APIRouter()
UPDATE_STATUS_KEY = "system_update_last_status"


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
    size_bytes: int
    modified_at: str


class UpdateStatus(BaseModel):
    state: str
    package_name: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    return_code: int | None = None
    stdout: str | None = None
    stderr: str | None = None


class ApplyUpdateRequest(BaseModel):
    package_name: str
    script_name: str = "update.sh"
    dry_run: bool = False


def _updates_dir() -> Path:
    root = Path(settings.storage_local_root) / "_system_updates"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _is_allowed_package(filename: str) -> bool:
    lower = filename.lower()
    return lower.endswith(".zip") or lower.endswith(".tar") or lower.endswith(".tar.gz") or lower.endswith(".tgz")


def _safe_name(value: str) -> str:
    return "".join(ch for ch in value if ch.isalnum() or ch in {"-", "_", "."})


def _save_update_status(db: Session, payload: dict) -> None:
    row = db.query(SystemSetting).filter(SystemSetting.key == UPDATE_STATUS_KEY).first()
    if row:
        row.value = payload
        row.category = "system"
    else:
        row = SystemSetting(key=UPDATE_STATUS_KEY, value=payload, category="system")
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
        setting = SystemSetting(key="storage_path", value=payload.new_path, category="system")
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
                    size_bytes=stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                )
            )
    return packages


@router.post("/update/upload")
def upload_update_package(
    upload: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_admin),
):
    if not upload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")

    safe_original = _safe_name(upload.filename)
    if not safe_original or not _is_allowed_package(safe_original):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .zip, .tar, .tar.gz and .tgz are allowed")

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    target_name = f"{timestamp}_{safe_original}"
    target_path = _updates_dir() / target_name

    with target_path.open("wb") as destination:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            destination.write(chunk)

    return {
        "message": "Update package uploaded",
        "package_name": target_name,
    }


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
    update_dir = _updates_dir()
    package_name = _safe_name(payload.package_name)
    if not package_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package name")

    package_path = (update_dir / package_name).resolve()
    if not package_path.exists() or update_dir.resolve() not in package_path.parents:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update package not found")

    extraction_base = update_dir / "extracted"
    extraction_base.mkdir(parents=True, exist_ok=True)

    started_at = datetime.now(UTC).isoformat()
    _save_update_status(
        db,
        {
            "state": "running",
            "package_name": package_name,
            "started_at": started_at,
            "finished_at": None,
            "return_code": None,
            "stdout": "",
            "stderr": "",
        },
    )

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

            script_name = _safe_name(payload.script_name)
            if not script_name:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid script name")

            script_path = (extract_path / script_name).resolve()
            if not script_path.exists() or extract_path not in script_path.parents:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Update script '{script_name}' not found in package root",
                )

            env = os.environ.copy()
            env["THOKAN_DRY_RUN"] = "1" if payload.dry_run else "0"

            result = subprocess.run(
                ["bash", str(script_path)],
                cwd=str(extract_path),
                capture_output=True,
                text=True,
                timeout=1800,
                env=env,
            )

            finished_at = datetime.now(UTC).isoformat()
            status_payload = {
                "state": "success" if result.returncode == 0 else "failed",
                "package_name": package_name,
                "started_at": started_at,
                "finished_at": finished_at,
                "return_code": result.returncode,
                "stdout": (result.stdout or "")[-10000:],
                "stderr": (result.stderr or "")[-10000:],
            }
            _save_update_status(db, status_payload)
            return UpdateStatus(**status_payload)

    except HTTPException as exc:
        finished_at = datetime.now(UTC).isoformat()
        status_payload = {
            "state": "failed",
            "package_name": package_name,
            "started_at": started_at,
            "finished_at": finished_at,
            "return_code": -1,
            "stdout": "",
            "stderr": exc.detail,
        }
        _save_update_status(db, status_payload)
        raise
    except Exception as exc:
        finished_at = datetime.now(UTC).isoformat()
        status_payload = {
            "state": "failed",
            "package_name": package_name,
            "started_at": started_at,
            "finished_at": finished_at,
            "return_code": -1,
            "stdout": "",
            "stderr": str(exc),
        }
        _save_update_status(db, status_payload)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Update failed: {exc}") from exc
