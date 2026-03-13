from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps import get_current_user, require_role
from app.models import SystemSetting, User

router = APIRouter()


def _setting_key(user_id: str) -> str:
    return f"push:ios:{user_id}"


def _load_tokens(db: Session, user_id: str) -> list[str]:
    row = db.get(SystemSetting, _setting_key(user_id))
    if not row:
        return []
    raw_tokens = row.value.get("tokens") if isinstance(row.value, dict) else []
    if not isinstance(raw_tokens, list):
        return []
    return [str(token) for token in raw_tokens if str(token).strip()]


def _save_tokens(db: Session, user_id: str, tokens: list[str], updated_by: str) -> None:
    key = _setting_key(user_id)
    row = db.get(SystemSetting, key)
    payload = {"tokens": tokens, "platform": "ios"}

    if not row:
        row = SystemSetting(key=key, value=payload, updated_by=updated_by)
        db.add(row)
    else:
        row.value = payload
        row.updated_by = updated_by

    db.commit()


def _apns_host() -> str:
    return "https://api.sandbox.push.apple.com" if settings.apns_use_sandbox else "https://api.push.apple.com"


def _apns_jwt() -> str:
    if not settings.apns_team_id or not settings.apns_key_id or not settings.apns_private_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="APNs is not configured")

    private_key = settings.apns_private_key.replace("\\n", "\n").strip()
    now = int(time.time())
    token = jwt.encode(
        {"iss": settings.apns_team_id, "iat": now},
        private_key,
        algorithm="ES256",
        headers={"kid": settings.apns_key_id},
    )
    return token


async def _send_apns(device_token: str, title: str, body: str, user_info: dict[str, Any] | None = None) -> None:
    if not settings.apns_bundle_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="APNs bundle id is not configured")

    auth_token = _apns_jwt()
    payload: dict[str, Any] = {
        "aps": {
            "alert": {"title": title, "body": body},
            "sound": "default",
        }
    }
    if user_info:
        payload.update(user_info)

    headers = {
        "authorization": f"bearer {auth_token}",
        "apns-topic": settings.apns_bundle_id,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
    }

    url = f"{_apns_host()}/3/device/{device_token}"
    async with httpx.AsyncClient(http2=True, timeout=12.0) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code >= 400:
        detail = response.text or "APNs request failed"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"APNs error: {detail}")


@router.get("/device-token")
def get_device_tokens(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tokens = _load_tokens(db, str(current_user.id))
    return {"platform": "ios", "tokens": tokens}


@router.post("/device-token")
def register_device_token(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    token = str(payload.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="token is required")

    tokens = _load_tokens(db, str(current_user.id))
    if token not in tokens:
        tokens.append(token)
        tokens = tokens[-10:]
    _save_tokens(db, str(current_user.id), tokens, str(current_user.id))

    return {"message": "Device token saved", "tokens": tokens}


@router.delete("/device-token")
def unregister_device_token(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    token = str(payload.get("token") or "").strip()
    tokens = _load_tokens(db, str(current_user.id))

    if token:
        tokens = [value for value in tokens if value != token]
    else:
        tokens = []

    _save_tokens(db, str(current_user.id), tokens, str(current_user.id))
    return {"message": "Device token removed", "tokens": tokens}


@router.post("/test")
async def send_test_notification(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    title = str(payload.get("title") or "ThoKan Cloud")
    body = str(payload.get("body") or "Test push from cloud")
    target_tab = int(payload.get("target_tab") or 0)

    tokens = _load_tokens(db, str(current_user.id))
    if not tokens:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No device token registered")

    sent = 0
    for token in tokens:
        await _send_apns(token, title, body, user_info={"target_tab": target_tab})
        sent += 1

    return {"message": "Test push sent", "sent": sent}


@router.post("/admin/test-user/{user_id}")
async def send_test_notification_for_user(
    user_id: str,
    payload: dict,
    _admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    title = str(payload.get("title") or "ThoKan Cloud")
    body = str(payload.get("body") or "Admin test push")
    target_tab = int(payload.get("target_tab") or 0)

    tokens = _load_tokens(db, user_id)
    if not tokens:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No device token registered for user")

    sent = 0
    for token in tokens:
        await _send_apns(token, title, body, user_info={"target_tab": target_tab})
        sent += 1

    return {"message": "Admin test push sent", "sent": sent}
