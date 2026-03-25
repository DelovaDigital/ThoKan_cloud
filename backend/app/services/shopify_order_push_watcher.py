from __future__ import annotations

import asyncio

from sqlalchemy.orm import Session

from app.api.routes.notifications import push_to_role_users
from app.api.routes.shopify import _get_raw_config, _map_order_summary, _shopify_request
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import SystemSetting, User


class ShopifyOrderPushWatcher:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._last_snapshot: dict[str, dict[str, str]] = {}

    def start(self) -> None:
        if self._task is not None or not settings.shopify_push_enabled:
            return
        self._task = asyncio.create_task(self._run(), name="shopify-order-push-watcher")

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
        poll_seconds = max(settings.shopify_push_poll_seconds, 5)
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
        for user_id, raw in candidates:
            try:
                payload = await asyncio.to_thread(self._load_orders_payload, user_id, raw)
            except Exception:
                continue

            orders = payload.get("orders", []) or []
            mapped = [_map_order_summary(order) for order in orders]
            snapshot = {
                order["id"]: f"{order.get('fulfillment_status') or ''}|{order.get('financial_status') or ''}|{order.get('total_price') or ''}"
                for order in mapped
                if order.get("id")
            }

            previous = self._last_snapshot.get(user_id)
            self._last_snapshot[user_id] = snapshot
            if previous is None:
                continue

            changed_orders = []
            for order in mapped:
                order_id = order.get("id") or ""
                if not order_id:
                    continue
                if previous.get(order_id) and previous.get(order_id) != snapshot.get(order_id):
                    changed_orders.append(order)

            if not changed_orders:
                continue

            db = SessionLocal()
            try:
                role_name = settings.shopify_push_target_role.strip() or "admin"
                for order in changed_orders[:5]:
                    await push_to_role_users(
                        db,
                        role_name,
                        f"Order update: {order.get('name') or order.get('id')}",
                        f"Afhandeling: {order.get('fulfillment_status') or '-'} • Betaling: {order.get('financial_status') or '-'}",
                        user_info={
                            "target_tab": 0,
                            "shopify_order_id": order.get("id") or "",
                        },
                    )
            finally:
                db.close()

    def _load_orders_payload(self, user_id: str, raw: dict) -> dict:
        db: Session = SessionLocal()
        try:
            return _shopify_request(
                db,
                user_id,
                raw,
                "orders.json",
                {"status": "any", "limit": 12, "order": "updated_at desc"},
            )
        finally:
            db.close()

    def _load_candidates(self) -> list[tuple[str, dict]]:
        db: Session = SessionLocal()
        try:
            rows = db.query(SystemSetting).filter(SystemSetting.key.like("push:ios:%")).all()
            user_ids = [row.key.removeprefix("push:ios:") for row in rows]
            candidates: list[tuple[str, dict]] = []
            for user_id in user_ids:
                user = db.get(User, user_id)
                if not user or not user.is_active:
                    continue
                raw = _get_raw_config(db, user_id)
                if raw:
                    candidates.append((user_id, raw))
            return candidates
        finally:
            db.close()


shopify_order_push_watcher = ShopifyOrderPushWatcher()