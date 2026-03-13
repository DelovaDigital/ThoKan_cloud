from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.security import generate_random_token, hash_password, hash_token, verify_password
from app.db.session import get_db
from app.deps import get_current_user
from app.models import File, SharedLink, SharedWithUser, User
from app.schemas.api import ShareLinkRequest, ShareLinkResponse, ShareUserRequest
from app.services.audit import log_event
from app.services.encryption import decrypt_bytes
from app.services.storage import get_storage_driver

router = APIRouter()


def _build_content_disposition(filename: str) -> str:
    sanitized = filename.replace("\r", "").replace("\n", "").replace('"', "")
    fallback = sanitized.encode("ascii", "ignore").decode("ascii").strip() or "download.bin"
    encoded = quote(sanitized or fallback, safe="")
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"


@router.post("/files/{file_id}/users")
def share_file_with_user(
    file_id: str,
    payload: ShareUserRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file = db.get(File, file_id)
    if not file or file.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can share")

    share = SharedWithUser(
        created_by=current_user.id,
        file_id=file.id,
        target_user_id=payload.target_user_id,
        can_read=payload.can_read,
        can_write=payload.can_write,
        can_delete=payload.can_delete,
        can_share=payload.can_share,
    )
    db.add(share)
    db.commit()
    log_event(db, "sharing.user", actor_user_id=current_user.id, entity_type="file", entity_id=file.id)
    return {"message": "File shared with user"}


@router.post("/files/{file_id}/links", response_model=ShareLinkResponse)
def create_share_link(
    file_id: str,
    payload: ShareLinkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file = db.get(File, file_id)
    if not file or file.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can share")

    token = generate_random_token()
    row = SharedLink(
        created_by=current_user.id,
        file_id=file.id,
        token_hash=hash_token(token),
        password_hash=hash_password(payload.password) if payload.password else None,
        expires_at=payload.expires_at,
        max_downloads=payload.max_downloads,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    log_event(db, "sharing.link.create", actor_user_id=current_user.id, entity_type="file", entity_id=file.id)
    return ShareLinkResponse(link_id=row.id, token=token, expires_at=row.expires_at)


@router.post("/links/{token}/download")
def download_by_share_link(token: str, password: str | None = None, db: Session = Depends(get_db)):
    token_hash = hash_token(token)
    row = db.query(SharedLink).filter(SharedLink.token_hash == token_hash, SharedLink.is_revoked.is_(False)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    if row.expires_at and row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Link expired")
    if row.max_downloads is not None and row.download_count >= row.max_downloads:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Download limit reached")
    if row.password_hash:
        if not password or not verify_password(password, row.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Password required")

    file = db.get(File, row.file_id)
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    try:
        encrypted = get_storage_driver().read(file.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file content not found") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to read stored file content") from exc

    try:
        raw = decrypt_bytes(encrypted, file.encryption_iv) if file.encryption_iv else encrypted
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Stored file content is corrupted") from exc

    row.download_count += 1
    db.commit()
    log_event(db, "sharing.link.download", entity_type="file", entity_id=file.id)
    return StreamingResponse(
        iter([raw]),
        media_type=file.mime_type or "application/octet-stream",
        headers={"Content-Disposition": _build_content_disposition(file.name)},
    )


@router.delete("/links/{link_id}")
def revoke_share_link(link_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(SharedLink, link_id)
    if not row or row.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    row.is_revoked = True
    db.commit()
    log_event(db, "sharing.link.revoke", actor_user_id=current_user.id, entity_type="share_link", entity_id=row.id)
    return {"message": "Share link revoked"}
