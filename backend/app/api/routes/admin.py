from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import generate_random_token, hash_token
from app.db.session import get_db
from app.deps import require_role
from app.models import AuditLog, File, Role, SystemSetting, User, UserInvitation, UserRole
from app.schemas.api import UserCreateRequest
from app.services.audit import log_event
from app.services.email import send_email

router = APIRouter()


@router.get("/users")
def list_users(
    _admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [{"id": user.id, "email": user.email, "full_name": user.full_name, "is_active": user.is_active} for user in users]


@router.post("/users")
def create_user(
    payload: UserCreateRequest,
    admin_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    role = db.query(Role).filter(Role.name == payload.role).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role does not exist")

    token = generate_random_token()
    invite = UserInvitation(
        email=payload.email,
        role_id=role.id,
        invited_by=admin_user.id,
        token_hash=hash_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    db.commit()

    send_email(
        payload.email,
        "ThoKan Cloud invitation",
        f"You were invited to ThoKan Cloud by {admin_user.full_name}. Invitation token: {token}",
    )
    log_event(db, "admin.user.invite", actor_user_id=admin_user.id, metadata={"email": payload.email, "role": payload.role})
    return {"message": "Invitation sent"}


@router.post("/users/{user_id}/roles/{role_name}")
def assign_role(
    user_id: str,
    role_name: str,
    admin_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    exists = db.query(UserRole).filter(UserRole.user_id == user.id, UserRole.role_id == role.id).first()
    if not exists:
        db.add(UserRole(user_id=user.id, role_id=role.id))
        db.commit()

    log_event(db, "admin.role.assign", actor_user_id=admin_user.id, entity_type="user", entity_id=user.id, metadata={"role": role_name})
    return {"message": "Role assigned"}


@router.get("/storage-usage")
def storage_usage(_admin: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    rows = (
        db.query(User.email, func.coalesce(func.sum(File.size_bytes), 0).label("used_bytes"))
        .outerjoin(File, File.owner_id == User.id)
        .group_by(User.email)
        .all()
    )
    return [{"email": row[0], "used_bytes": int(row[1])} for row in rows]


@router.get("/settings")
def get_settings(_admin: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    rows = db.query(SystemSetting).all()
    return [{"key": row.key, "value": row.value, "updated_at": row.updated_at} for row in rows]


@router.put("/settings/{key}")
def update_setting(
    key: str,
    value: dict,
    admin_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    row = db.get(SystemSetting, key)
    if not row:
        row = SystemSetting(key=key, value=value, updated_by=admin_user.id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = admin_user.id
    db.commit()
    log_event(db, "admin.settings.update", actor_user_id=admin_user.id, entity_type="system_setting")
    return {"message": "Setting updated"}


@router.get("/audit-logs")
def audit_logs(_admin: User = Depends(require_role("admin")), db: Session = Depends(get_db), limit: int = 100):
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": row.id,
            "event_type": row.event_type,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "actor_user_id": row.actor_user_id,
            "metadata": row.event_metadata,
            "created_at": row.created_at,
        }
        for row in rows
    ]
