import base64
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models import SystemSetting, User
from app.services.encryption import decrypt_bytes, encrypt_bytes

router = APIRouter()


def _shopify_key(user_id: str) -> str:
    return f"shopify:{user_id}"


def _normalize_store_domain(value: str) -> str:
    domain = (value or "").strip().lower()
    domain = re.sub(r"^https?://", "", domain)
    domain = domain.split("/")[0]
    return domain


def _get_raw_config(db: Session, user_id: str) -> dict | None:
    row = db.get(SystemSetting, _shopify_key(user_id))
    return row.value if row else None


def _save_config(db: Session, user_id: str, value: dict) -> None:
    row = db.get(SystemSetting, _shopify_key(user_id))
    if not row:
        row = SystemSetting(key=_shopify_key(user_id), value=value, updated_by=user_id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = user_id
    db.commit()


def _decrypted_token(raw: dict) -> str:
    encrypted_b64 = raw.get("access_token_enc")
    iv = raw.get("access_token_iv")
    if not encrypted_b64 or not iv:
        return ""
    encrypted = base64.b64decode(encrypted_b64.encode("utf-8"))
    return decrypt_bytes(encrypted, iv).decode("utf-8")


def _shopify_request(raw: dict, path: str, params: dict | None = None) -> dict:
    store_domain = _normalize_store_domain(raw.get("store_domain") or "")
    api_version = raw.get("api_version") or "2024-10"
    access_token = _decrypted_token(raw)

    if not store_domain or not access_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incomplete Shopify configuration")

    url = f"https://{store_domain}/admin/api/{api_version}/{path}"
    headers = {"X-Shopify-Access-Token": access_token, "Content-Type": "application/json"}

    with httpx.Client(timeout=20.0) as client:
        response = client.get(url, params=params or {}, headers=headers)

    if response.status_code >= 400:
        detail = response.text[:400]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shopify API error ({response.status_code}): {detail}",
        )

    return response.json()


@router.get("/config")
def get_shopify_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id)) or {}
    return {
        "store_domain": raw.get("store_domain", ""),
        "api_version": raw.get("api_version", "2024-10"),
        "has_access_token": bool(raw.get("access_token_enc") and raw.get("access_token_iv")),
    }


@router.put("/config")
def save_shopify_config(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id)) or {}
    store_domain = _normalize_store_domain(payload.get("store_domain") or raw.get("store_domain") or "")
    api_version = (payload.get("api_version") or raw.get("api_version") or "2024-10").strip()
    access_token = (payload.get("access_token") or "").strip()

    if not store_domain:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="store_domain is required")
    if not store_domain.endswith(".myshopify.com"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="store_domain must end with .myshopify.com",
        )

    access_token_enc = raw.get("access_token_enc")
    access_token_iv = raw.get("access_token_iv")
    if access_token:
        encrypted, iv = encrypt_bytes(access_token.encode("utf-8"))
        access_token_enc = base64.b64encode(encrypted).decode("utf-8")
        access_token_iv = iv

    data = {
        "store_domain": store_domain,
        "api_version": api_version,
        "access_token_enc": access_token_enc,
        "access_token_iv": access_token_iv,
    }
    _save_config(db, str(current_user.id), data)
    return {"message": "Shopify configuration saved"}


@router.get("/orders")
def list_shopify_orders(
    limit: int = Query(default=20, ge=1, le=100),
    status_filter: str = Query(default="any", alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopify config not found")

    params = {"status": status_filter, "limit": limit, "order": "created_at desc"}

    try:
        payload = _shopify_request(raw, "orders.json", params=params)
        orders = payload.get("orders", [])
        mapped = []
        for order in orders:
            customer = order.get("customer") or {}
            full_name = " ".join(
                part for part in [customer.get("first_name", ""), customer.get("last_name", "")] if part
            ).strip()
            mapped.append(
                {
                    "id": str(order.get("id", "")),
                    "name": order.get("name") or "-",
                    "email": order.get("email") or customer.get("email") or "",
                    "customer_name": full_name,
                    "financial_status": order.get("financial_status") or "",
                    "fulfillment_status": order.get("fulfillment_status") or "unfulfilled",
                    "currency": order.get("currency") or "",
                    "total_price": order.get("total_price") or "0",
                    "created_at": order.get("created_at") or "",
                }
            )

        return {"orders": mapped, "count": len(mapped)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to load Shopify orders: {exc}") from exc


@router.get("/orders/{order_id}")
def get_shopify_order(order_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopify config not found")

    try:
        payload = _shopify_request(raw, f"orders/{order_id}.json", params={"status": "any"})
        order = payload.get("order")
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

        customer = order.get("customer") or {}
        shipping = order.get("shipping_address") or {}
        billing = order.get("billing_address") or {}

        def _address_lines(source: dict) -> list[str]:
            parts = [
                source.get("name"),
                source.get("address1"),
                source.get("address2"),
                " ".join(part for part in [source.get("zip"), source.get("city")] if part).strip(),
                source.get("province"),
                source.get("country"),
                source.get("phone"),
            ]
            return [part for part in parts if part]

        detail = {
            "id": str(order.get("id", "")),
            "name": order.get("name") or "-",
            "email": order.get("email") or customer.get("email") or "",
            "customer_name": " ".join(
                part for part in [customer.get("first_name", ""), customer.get("last_name", "")] if part
            ).strip(),
            "financial_status": order.get("financial_status") or "",
            "fulfillment_status": order.get("fulfillment_status") or "unfulfilled",
            "currency": order.get("currency") or "",
            "total_price": order.get("total_price") or "0",
            "subtotal_price": order.get("subtotal_price") or "0",
            "total_tax": order.get("total_tax") or "0",
            "total_discounts": order.get("total_discounts") or "0",
            "created_at": order.get("created_at") or "",
            "note": order.get("note") or "",
            "shipping_address": _address_lines(shipping),
            "billing_address": _address_lines(billing),
            "line_items": [
                {
                    "id": str(item.get("id", "")),
                    "title": item.get("title") or "",
                    "sku": item.get("sku") or "",
                    "quantity": item.get("quantity") or 0,
                    "price": item.get("price") or "0",
                    "currency": order.get("currency") or "",
                }
                for item in (order.get("line_items") or [])
            ],
        }
        return detail
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to load Shopify order: {exc}") from exc