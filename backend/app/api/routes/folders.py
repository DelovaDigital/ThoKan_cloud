from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models import Folder, User
from app.schemas.api import FolderCreateRequest, FolderResponse
from app.services.audit import log_event

router = APIRouter()


@router.post("", response_model=FolderResponse)
def create_folder(payload: FolderCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    parent_path = ""
    if payload.parent_id:
        parent = db.get(Folder, payload.parent_id)
        if not parent or parent.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")
        parent_path = parent.path

    path = f"{parent_path}/{payload.name}" if parent_path else f"/{payload.name}"
    folder = Folder(owner_id=current_user.id, parent_id=payload.parent_id, name=payload.name, path=path)
    db.add(folder)
    db.commit()
    db.refresh(folder)

    log_event(db, "folder.create", actor_user_id=current_user.id, entity_type="folder", entity_id=folder.id)
    return FolderResponse(id=folder.id, name=folder.name, parent_id=folder.parent_id, owner_id=folder.owner_id, path=folder.path)


@router.get("", response_model=list[FolderResponse])
def list_folders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Folder).filter(Folder.owner_id == current_user.id, Folder.is_deleted.is_(False)).all()
    return [
        FolderResponse(id=row.id, name=row.name, parent_id=row.parent_id, owner_id=row.owner_id, path=row.path)
        for row in rows
    ]


@router.delete("/{folder_id}")
def delete_folder(folder_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if not folder or folder.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    folder.is_deleted = True
    db.commit()
    log_event(db, "folder.delete", actor_user_id=current_user.id, entity_type="folder", entity_id=folder.id)
    return {"message": "Folder deleted"}
