from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models import SystemSetting, User
from app.services.audit import log_event

router = APIRouter()


class ChatSendRequest(BaseModel):
    body: str


def _conversation_key(user_a: uuid.UUID, user_b: uuid.UUID) -> str:
    left, right = sorted([str(user_a), str(user_b)])
    return f"user-chat:{left}:{right}"


def _load_conversation(db: Session, user_a: uuid.UUID, user_b: uuid.UUID) -> tuple[SystemSetting | None, dict]:
    key = _conversation_key(user_a, user_b)
    row = db.get(SystemSetting, key)
    if not row or not isinstance(row.value, dict):
        return row, {"participants": [str(user_a), str(user_b)], "messages": []}
    payload = dict(row.value)
    payload.setdefault("participants", [str(user_a), str(user_b)])
    payload.setdefault("messages", [])
    return row, payload


@router.get("/conversations/{user_id}")
def get_direct_conversation(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_user = db.get(User, user_id)
    if not target_user or not target_user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target_user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot open a chat with yourself")

    _, payload = _load_conversation(db, current_user.id, target_user.id)
    messages = payload.get("messages", [])[-100:]
    return {
        "participant": {
            "id": str(target_user.id),
            "email": target_user.email,
            "full_name": target_user.full_name,
            "is_active": target_user.is_active,
        },
        "messages": messages,
    }


@router.post("/conversations/{user_id}")
def send_direct_message(
    user_id: str,
    payload: ChatSendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_user = db.get(User, user_id)
    if not target_user or not target_user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target_user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot send a chat to yourself")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required")

    row, conversation = _load_conversation(db, current_user.id, target_user.id)
    messages = list(conversation.get("messages", []))
    message = {
        "id": str(uuid.uuid4()),
        "sender_id": str(current_user.id),
        "recipient_id": str(target_user.id),
        "body": body,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    messages.append(message)
    conversation["messages"] = messages[-250:]

    key = _conversation_key(current_user.id, target_user.id)
    if row:
        row.value = conversation
        row.updated_by = current_user.id
    else:
        db.add(SystemSetting(key=key, value=conversation, updated_by=current_user.id))
    db.commit()

    log_event(
        db,
        "chat.direct.send",
        actor_user_id=current_user.id,
        entity_type="user",
        entity_id=target_user.id,
        metadata={"recipient_id": str(target_user.id)},
    )
    return {"message": "Message sent", "chat_message": message}