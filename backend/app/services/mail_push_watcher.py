from __future__ import annotations

import asyncio

from sqlalchemy.orm import Session

from app.api.routes.mail import _fetch_latest_inbox_messages, _get_raw_config
from app.api.routes.notifications import _load_tokens, _send_apns
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import SystemSetting, User


class MailPushWatcher:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._last_seen_message_id: dict[str, str] = {}

    def start(self) -> None:
        if self._task is not None or not settings.mail_push_enabled:
            return
        self._task = asyncio.create_task(self._run(), name="mail-push-watcher")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        poll_seconds = max(settings.mail_push_poll_seconds, 3)
        while True:
            try:
                await self._poll_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            await asyncio.sleep(poll_seconds)

    async def _poll_once(self) -> None:
        if not settings.apns_bundle_id:
            return

        candidates = await asyncio.to_thread(self._load_candidates)
        for user_id, display_name, tokens, mail_config in candidates:
            try:
                latest_messages = await asyncio.to_thread(_fetch_latest_inbox_messages, mail_config, 8)
            except Exception:
                continue

            if not latest_messages:
                continue

            latest_id = latest_messages[0]["id"]
            previous_id = self._last_seen_message_id.get(user_id)
            if previous_id is None:
                self._last_seen_message_id[user_id] = latest_id
                continue

            if previous_id == latest_id:
                continue

            new_messages: list[dict[str, str]] = []
            for message in latest_messages:
                if message["id"] == previous_id:
                    break
                new_messages.append(message)

            self._last_seen_message_id[user_id] = latest_id
            if not new_messages:
                continue

            for message in reversed(new_messages[-5:]):
                sender = message["from"] or "Nieuwe afzender"
                subject = message["subject"] or "Nieuw bericht"
                for token in tokens:
                    try:
                        await _send_apns(
                            token,
                            f"Nieuwe mail voor {display_name}",
                            f"{sender}: {subject}",
                            user_info={
                                "target_tab": 3,
                                "mail_message_id": message["id"],
                            },
                        )
                    except Exception:
                        continue

    def _load_candidates(self) -> list[tuple[str, str, list[str], dict]]:
        db: Session = SessionLocal()
        try:
            rows = db.query(SystemSetting).filter(SystemSetting.key.like("push:ios:%")).all()
            candidates: list[tuple[str, str, list[str], dict]] = []
            for row in rows:
                user_id = row.key.removeprefix("push:ios:")
                tokens = _load_tokens(db, user_id)
                if not tokens:
                    continue

                mail_config = _get_raw_config(db, user_id)
                if not mail_config:
                    continue

                user = db.get(User, user_id)
                if not user or not user.is_active:
                    continue

                display_name = user.full_name or user.email or "ThoKan Cloud"
                candidates.append((user_id, display_name, tokens, mail_config))
            return candidates
        finally:
            db.close()


mail_push_watcher = MailPushWatcher()