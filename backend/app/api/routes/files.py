from __future__ import annotations

import hashlib
import mimetypes
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, File as UploadFileField, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.deps import get_current_user, get_user_roles
from app.models import File, FileVersion, Folder, User
from app.schemas.api import FileResponse, MoveRequest, RenameRequest
from app.services.audit import log_event
from app.services.encryption import decrypt_bytes, encrypt_bytes
from app.services.scanner import scan_file_bytes
from app.services.storage import get_storage_driver

router = APIRouter()
optional_bearer = HTTPBearer(auto_error=False)


def _build_content_disposition(filename: str) -> str:
    sanitized = filename.replace("\r", "").replace("\n", "").replace('"', "")
    fallback = sanitized.encode("ascii", "ignore").decode("ascii").strip() or "download.bin"
    encoded = quote(sanitized or fallback, safe="")
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"


def _is_admin(db: Session, user: User) -> bool:
    return "admin" in get_user_roles(db, user.id)


def _resolve_request_user(
    db: Session,
    credentials: HTTPAuthorizationCredentials | None,
    token: str | None,
) -> User:
    raw_token = credentials.credentials if credentials else token
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    try:
        payload = decode_access_token(raw_token)
        user_id = uuid.UUID(payload["sub"])
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    return user


@router.get("", response_model=list[FileResponse])
def list_files(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(File).filter(File.owner_id == current_user.id, File.is_deleted.is_(False)).order_by(File.created_at.desc()).all()
    return [
        FileResponse(
            id=row.id,
            name=row.name,
            owner_id=row.owner_id,
            folder_id=row.folder_id,
            size_bytes=row.size_bytes,
            mime_type=row.mime_type,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/upload", response_model=FileResponse)
async def upload_file(
    folder_id: str | None = None,
    upload: UploadFile = UploadFileField(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if folder_id:
        folder = db.get(Folder, folder_id)
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    payload = await upload.read()
    if not scan_file_bytes(payload, upload.filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File blocked by scanner")

    encrypted_payload, iv = encrypt_bytes(payload)
    storage_key = f"{current_user.id}/{uuid.uuid4()}-{upload.filename}"
    get_storage_driver().save(storage_key, encrypted_payload)

    checksum = hashlib.sha256(payload).hexdigest()
    mime_type = upload.content_type or mimetypes.guess_type(upload.filename)[0] or "application/octet-stream"

    file = File(
        owner_id=current_user.id,
        folder_id=folder_id,
        name=upload.filename,
        mime_type=mime_type,
        size_bytes=len(payload),
        checksum_sha256=checksum,
        storage_key=storage_key,
        encryption_iv=iv,
    )
    db.add(file)
    db.flush()

    version = FileVersion(
        file_id=file.id,
        version_number=1,
        storage_key=storage_key,
        size_bytes=len(payload),
        checksum_sha256=checksum,
        uploaded_by=current_user.id,
    )
    db.add(version)
    db.flush()
    file.current_version_id = version.id
    db.commit()
    db.refresh(file)

    log_event(db, "file.upload", actor_user_id=current_user.id, entity_type="file", entity_id=file.id)
    return FileResponse(
        id=file.id,
        name=file.name,
        owner_id=file.owner_id,
        folder_id=file.folder_id,
        size_bytes=file.size_bytes,
        mime_type=file.mime_type,
        created_at=file.created_at,
    )


@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    token: str | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
    db: Session = Depends(get_db),
):
    current_user = _resolve_request_user(db, credentials, token)
    row = db.get(File, file_id)
    if not row or row.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if row.owner_id != current_user.id and not _is_admin(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    try:
        encrypted = get_storage_driver().read(row.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file content not found") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to read stored file content") from exc

    try:
        raw = decrypt_bytes(encrypted, row.encryption_iv) if row.encryption_iv else encrypted
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Stored file content is corrupted") from exc

    log_event(db, "file.download", actor_user_id=current_user.id, entity_type="file", entity_id=row.id)
    return StreamingResponse(
        iter([raw]),
        media_type=row.mime_type or "application/octet-stream",
        headers={"Content-Disposition": _build_content_disposition(row.name)},
    )


@router.patch("/{file_id}/rename", response_model=FileResponse)
def rename_file(file_id: str, payload: RenameRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(File, file_id)
    if not row or row.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if row.owner_id != current_user.id and not _is_admin(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    row.name = payload.name
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    log_event(db, "file.rename", actor_user_id=current_user.id, entity_type="file", entity_id=row.id)
    return FileResponse(
        id=row.id,
        name=row.name,
        owner_id=row.owner_id,
        folder_id=row.folder_id,
        size_bytes=row.size_bytes,
        mime_type=row.mime_type,
        created_at=row.created_at,
    )


@router.patch("/{file_id}/move", response_model=FileResponse)
def move_file(file_id: str, payload: MoveRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(File, file_id)
    if not row or row.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if row.owner_id != current_user.id and not _is_admin(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if payload.folder_id:
        folder = db.get(Folder, payload.folder_id)
        if not folder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target folder not found")
    row.folder_id = payload.folder_id
    db.commit()
    db.refresh(row)
    log_event(db, "file.move", actor_user_id=current_user.id, entity_type="file", entity_id=row.id)
    return FileResponse(
        id=row.id,
        name=row.name,
        owner_id=row.owner_id,
        folder_id=row.folder_id,
        size_bytes=row.size_bytes,
        mime_type=row.mime_type,
        created_at=row.created_at,
    )


@router.delete("/{file_id}")
def delete_file(file_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(File, file_id)
    if not row or row.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if row.owner_id != current_user.id and not _is_admin(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    row.is_deleted = True
    db.commit()
    log_event(db, "file.delete", actor_user_id=current_user.id, entity_type="file", entity_id=row.id)
    return {"message": "File deleted"}


@router.get("/{file_id}/versions")
def get_versions(file_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(File, file_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if row.owner_id != current_user.id and not _is_admin(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    versions = (
        db.query(FileVersion)
        .filter(FileVersion.file_id == row.id)
        .order_by(FileVersion.version_number.desc())
        .all()
    )
    return [
        {
            "id": version.id,
            "version_number": version.version_number,
            "size_bytes": version.size_bytes,
            "checksum_sha256": version.checksum_sha256,
            "created_at": version.created_at,
        }
        for version in versions
    ]
