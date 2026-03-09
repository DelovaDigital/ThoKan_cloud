from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models import File, FilePermission, Folder, FolderPermission, User

router = APIRouter()


def _ensure_owner_file(db: Session, file_id: str, current_user: User) -> File:
    file = db.get(File, file_id)
    if not file or file.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can manage permissions")
    return file


def _ensure_owner_folder(db: Session, folder_id: str, current_user: User) -> Folder:
    folder = db.get(Folder, folder_id)
    if not folder or folder.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if folder.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can manage permissions")
    return folder


@router.post("/files/{file_id}/users/{user_id}")
def set_file_permission(
    file_id: str,
    user_id: str,
    can_read: bool = True,
    can_write: bool = False,
    can_delete: bool = False,
    can_share: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file = _ensure_owner_file(db, file_id, current_user)
    permission = db.query(FilePermission).filter(FilePermission.file_id == file.id, FilePermission.user_id == user_id).first()
    if not permission:
        permission = FilePermission(file_id=file.id, user_id=user_id)
        db.add(permission)

    permission.can_read = can_read
    permission.can_write = can_write
    permission.can_delete = can_delete
    permission.can_share = can_share
    db.commit()
    return {"message": "File permission updated"}


@router.post("/folders/{folder_id}/users/{user_id}")
def set_folder_permission(
    folder_id: str,
    user_id: str,
    can_read: bool = True,
    can_write: bool = False,
    can_delete: bool = False,
    can_share: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = _ensure_owner_folder(db, folder_id, current_user)
    permission = db.query(FolderPermission).filter(FolderPermission.folder_id == folder.id, FolderPermission.user_id == user_id).first()
    if not permission:
        permission = FolderPermission(folder_id=folder.id, user_id=user_id)
        db.add(permission)

    permission.can_read = can_read
    permission.can_write = can_write
    permission.can_delete = can_delete
    permission.can_share = can_share
    db.commit()
    return {"message": "Folder permission updated"}
