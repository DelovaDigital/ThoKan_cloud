import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: str, roles: list[str]) -> tuple[str, datetime]:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_expires_min)
    payload = {"sub": subject, "roles": roles, "exp": expires_at}
    token = jwt.encode(payload, settings.jwt_access_secret, algorithm="HS256")
    return token, expires_at


def create_refresh_token(subject: str) -> tuple[str, datetime]:
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expires_days)
    payload = {"sub": subject, "exp": expires_at, "typ": "refresh"}
    token = jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")
    return token, expires_at


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Invalid access token") from exc


def decode_refresh_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Invalid refresh token") from exc


def generate_random_token(length: int = 48) -> str:
    return secrets.token_urlsafe(length)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
