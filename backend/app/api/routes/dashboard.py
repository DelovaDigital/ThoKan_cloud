import os
import platform
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps import get_current_user
from app.models import AuditLog, File, User
from app.schemas.api import DashboardResponse, FileResponse

router = APIRouter()


def _system_info() -> dict:
    storage_path = Path(settings.storage_local_root)
    storage_path.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(storage_path)

    gib = 1024**3
    return {
        "hostname": platform.node(),
        "platform": platform.platform(),
        "cpu_cores": os.cpu_count() or 1,
        "storage_path": str(storage_path),
        "storage_total_gb": round(usage.total / gib, 2),
        "storage_used_gb": round(usage.used / gib, 2),
        "storage_free_gb": round(usage.free / gib, 2),
    }


@router.get("", response_model=DashboardResponse)
def dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    used_bytes = (
        db.query(func.coalesce(func.sum(File.size_bytes), 0))
        .filter(File.owner_id == current_user.id, File.is_deleted.is_(False))
        .scalar()
    )
    files_count = db.query(func.count(File.id)).filter(File.owner_id == current_user.id, File.is_deleted.is_(False)).scalar()
    recent_files_rows = (
        db.query(File)
        .filter(File.owner_id == current_user.id, File.is_deleted.is_(False))
        .order_by(File.created_at.desc())
        .limit(10)
        .all()
    )
    recent_activity_rows = (
        db.query(AuditLog)
        .filter(AuditLog.actor_user_id == current_user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(10)
        .all()
    )

    return DashboardResponse(
        used_bytes=used_bytes,
        files_count=files_count,
        system_info=_system_info(),
        recent_files=[
            FileResponse(
                id=file.id,
                name=file.name,
                owner_id=file.owner_id,
                folder_id=file.folder_id,
                size_bytes=file.size_bytes,
                mime_type=file.mime_type,
                created_at=file.created_at,
            )
            for file in recent_files_rows
        ],
        recent_activity=[
            {
                "event_type": row.event_type,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "created_at": row.created_at,
            }
            for row in recent_activity_rows
        ],
    )
