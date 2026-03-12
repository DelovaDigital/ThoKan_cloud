import logging
from datetime import datetime, timedelta, timezone
from secrets import compare_digest

import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    generate_random_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.session import get_db
from app.deps import get_current_user, get_user_roles
from app.models import PasswordResetToken, RefreshToken, Role, User, UserRole
from app.schemas.api import (
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshRequest,
    TokenResponse,
    UserCreateRequest,
    UserResponse,
)
from app.services.audit import log_event
from app.services.email import send_email

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/register", response_model=UserResponse)
def register(payload: UserCreateRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user = User(email=payload.email, full_name=payload.full_name, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()

    role = db.query(Role).filter(Role.name == payload.role).first()
    if not role:
        role = db.query(Role).filter(Role.name == "employee").first()
    if role:
        db.add(UserRole(user_id=user.id, role_id=role.id))

    db.commit()
    db.refresh(user)

    role_names = get_user_roles(db, user.id)
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=role_names,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    password_valid = False
    if user:
        try:
            password_valid = verify_password(payload.password, user.password_hash)
        except Exception:
            if compare_digest(user.password_hash, payload.password):
                user.password_hash = hash_password(payload.password)
                password_valid = True
                logger.warning("Migrated legacy plaintext password for user_id=%s", user.id)
            else:
                logger.warning("Invalid stored password hash for user_id=%s", user.id)

    if not user or not password_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")

    if user.two_factor_enabled:
        if not payload.totp_code or not user.two_factor_secret:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="2FA code required")
        if not pyotp.TOTP(user.two_factor_secret).verify(payload.totp_code, valid_window=1):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    roles = get_user_roles(db, user.id)
    access_token, access_expires_at = create_access_token(str(user.id), roles)
    refresh_token, refresh_expires_at = create_refresh_token(str(user.id))
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=refresh_expires_at,
        )
    )
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    log_event(db, "auth.login", actor_user_id=user.id, entity_type="user", entity_id=user.id)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, expires_at=access_expires_at)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        decoded = decode_refresh_token(payload.refresh_token)
        user_id = decoded["sub"]
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    token_hash = hash_token(payload.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None)).first()
    if not row or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    row.revoked_at = datetime.now(timezone.utc)
    roles = get_user_roles(db, user.id)
    access_token, access_expires_at = create_access_token(str(user.id), roles)
    new_refresh_token, refresh_expires_at = create_refresh_token(str(user.id))
    db.add(RefreshToken(user_id=user.id, token_hash=hash_token(new_refresh_token), expires_at=refresh_expires_at))
    db.commit()

    return TokenResponse(access_token=access_token, refresh_token=new_refresh_token, expires_at=access_expires_at)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    roles = get_user_roles(db, current_user.id)
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        roles=roles,
    )


@router.post("/password-reset/request")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        token = generate_random_token()
        token_hash = hash_token(token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
        db.commit()
        send_email(user.email, "ThoKan Cloud password reset", f"Use this token to reset your password: {token}")
    return {"message": "If the email exists, a reset message has been sent."}


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirmRequest, db: Session = Depends(get_db)):
    token_hash = hash_token(payload.token)
    row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == token_hash, PasswordResetToken.used_at.is_(None))
        .first()
    )
    if not row or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password_hash = hash_password(payload.new_password)
    row.used_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Password reset successful"}
