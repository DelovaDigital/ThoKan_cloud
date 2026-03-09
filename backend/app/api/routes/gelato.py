import base64
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models import SystemSetting, User
from app.services.encryption import decrypt_bytes, encrypt_bytes

router = APIRouter()


def _gelato_key(user_id: str) -> str:
    return f"gelato:{user_id}"


def _shopify_key(user_id: str) -> str:
    return f"shopify:{user_id}"


def _normalize_shop_domain(value: str) -> str:
    domain = (value or "").strip().lower()
    domain = re.sub(r"^https?://", "", domain)
    domain = domain.split("/")[0]
    return domain


def _get_raw_config(db: Session, key: str) -> dict | None:
    row = db.get(SystemSetting, key)
    return row.value if row else None


def _save_config(db: Session, key: str, user_id: str, value: dict) -> None:
    row = db.get(SystemSetting, key)
    if not row:
        row = SystemSetting(key=key, value=value, updated_by=user_id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = user_id
    db.commit()


def _decrypt_secret(raw: dict, enc_key: str, iv_key: str) -> str:
    encrypted_b64 = raw.get(enc_key)
    iv = raw.get(iv_key)
    if not encrypted_b64 or not iv:
        return ""
    encrypted = base64.b64decode(encrypted_b64.encode("utf-8"))
    return decrypt_bytes(encrypted, iv).decode("utf-8")


def _encrypt_secret(value: str) -> tuple[str, str]:
    encrypted, iv = encrypt_bytes(value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8"), iv


def _gelato_request(raw: dict, method: str, path: str, params: dict | None = None, payload: dict | None = None) -> dict:
    api_key = _decrypt_secret(raw, "api_key_enc", "api_key_iv")
    base_url = (raw.get("base_url") or "https://order.gelatoapis.com").rstrip("/")
    if not api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Gelato API key not configured")

    url = f"{base_url}/v4/{path.lstrip('/')}"
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}

    with httpx.Client(timeout=30.0) as client:
        response = client.request(method=method.upper(), url=url, params=params or {}, json=payload, headers=headers)

    if response.status_code >= 400:
        detail = response.text[:500]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gelato API error ({response.status_code}): {detail}",
        )

    if not response.content:
        return {}
    return response.json()


def _extract_gelato_order_id(payload: dict) -> str:
    candidates = [
        payload.get("id"),
        payload.get("orderId"),
        (payload.get("order") or {}).get("id") if isinstance(payload.get("order"), dict) else None,
        (payload.get("data") or {}).get("id") if isinstance(payload.get("data"), dict) else None,
    ]
    for candidate in candidates:
        value = str(candidate or "").strip()
        if value:
            return value
    return ""


def _extract_first_order(payload: dict) -> dict:
    if isinstance(payload.get("order"), dict):
        return payload["order"]
    if isinstance(payload.get("data"), dict) and isinstance(payload["data"].get("order"), dict):
        return payload["data"]["order"]

    for key in ["orders", "data", "results", "items"]:
        value = payload.get(key)
        if isinstance(value, list) and value:
            first = value[0]
            if isinstance(first, dict):
                return first
        if isinstance(value, dict):
            for nested_key in ["orders", "items", "results"]:
                nested_value = value.get(nested_key)
                if isinstance(nested_value, list) and nested_value:
                    first = nested_value[0]
                    if isinstance(first, dict):
                        return first
    return {}


def _parse_list(value: object) -> list[dict]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def _walk_values(value: object):
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from _walk_values(nested)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_values(item)


def _find_first_string(value: object, keys: list[str]) -> str:
    key_set = {k.lower() for k in keys}
    for node in _walk_values(value):
        if not isinstance(node, dict):
            continue
        for key, candidate in node.items():
            if str(key).lower() not in key_set:
                continue
            result = str(candidate or "").strip()
            if result:
                return result
    return ""


def _collect_strings(value: object, keys: list[str]) -> list[str]:
    key_set = {k.lower() for k in keys}
    collected: list[str] = []
    seen: set[str] = set()
    for node in _walk_values(value):
        if not isinstance(node, dict):
            continue
        for key, candidate in node.items():
            if str(key).lower() not in key_set:
                continue
            result = str(candidate or "").strip()
            if result and result not in seen:
                seen.add(result)
                collected.append(result)
    return collected


def _normalize_gelato_status_payload(order_id: str, payload: dict) -> dict:
    order = payload if payload.get("id") or payload.get("status") else _extract_first_order(payload)
    if not order:
        return {
            "found": False,
            "shopify_order_id": order_id,
        }

    shipment_list = _parse_list(order.get("shipments"))
    if not shipment_list:
        shipment_list = _parse_list((order.get("fulfillment") or {}).get("shipments") if isinstance(order.get("fulfillment"), dict) else [])
    if not shipment_list:
        shipment_list = _parse_list(order.get("deliveries"))
    if not shipment_list:
        shipment_list = _parse_list(order.get("parcels"))

    tracking_numbers: list[str] = []
    tracking_urls: list[str] = []
    carriers: list[str] = []
    last_mile_statuses: list[str] = []
    for shipment in shipment_list:
        tracking_number = str(shipment.get("trackingNumber") or shipment.get("tracking_number") or "").strip()
        if tracking_number:
            tracking_numbers.append(tracking_number)
        tracking_url = str(shipment.get("trackingUrl") or shipment.get("tracking_url") or "").strip()
        if tracking_url:
            tracking_urls.append(tracking_url)
        carrier = str(shipment.get("carrier") or shipment.get("shippingProvider") or "").strip()
        if carrier:
            carriers.append(carrier)
        shipment_status = str(shipment.get("status") or "").strip()
        if shipment_status:
            last_mile_statuses.append(shipment_status)

    if not tracking_numbers:
        tracking_numbers = _collect_strings(order, ["trackingNumber", "tracking_number", "trackingNo"])
    if not tracking_urls:
        tracking_urls = _collect_strings(
            order,
            [
                "trackingUrl",
                "tracking_url",
                "trackingLink",
                "tracking_link",
                "carrierTrackingUrl",
                "carrier_tracking_url",
            ],
        )
        tracking_urls = [url for url in tracking_urls if url.startswith("http://") or url.startswith("https://")]
    if not carriers:
        carriers = _collect_strings(order, ["carrier", "shippingProvider", "provider", "courier"])
    if not last_mile_statuses:
        last_mile_statuses = _collect_strings(order, ["shipmentStatus", "shippingStatus", "deliveryStatus", "status"])

    recipient = order.get("recipient") if isinstance(order.get("recipient"), dict) else {}
    first_name = str(recipient.get("firstName") or recipient.get("first_name") or "").strip()
    last_name = str(recipient.get("lastName") or recipient.get("last_name") or "").strip()
    recipient_name = " ".join(part for part in [first_name, last_name] if part).strip()
    if not recipient_name:
        recipient_name = _find_first_string(order, ["fullName", "name", "recipientName", "customerName"])

    external_id = str(order.get("externalId") or order.get("external_id") or "").strip()
    if not external_id:
        external_id = _find_first_string(order, ["externalId", "external_id", "externalReferenceId", "externalReference"])

    status_value = str(order.get("status") or order.get("orderStatus") or "").strip()
    production_status = str(order.get("productionStatus") or order.get("production_status") or "").strip()
    shipping_status = str(order.get("shippingStatus") or order.get("shipping_status") or order.get("fulfillmentStatus") or "").strip()
    delivery_status = str(order.get("deliveryStatus") or order.get("delivery_status") or "").strip()
    if not production_status:
        production_status = _find_first_string(order, ["productionStatus", "production_status", "printStatus"])
    if not shipping_status:
        shipping_status = _find_first_string(order, ["shippingStatus", "shipping_status", "fulfillmentStatus"])
    if not delivery_status:
        delivery_status = _find_first_string(order, ["deliveryStatus", "delivery_status"])

    stage = "processing"
    lowered_blob = " ".join([status_value, production_status, shipping_status, delivery_status, " ".join(last_mile_statuses)]).lower()
    if "delivered" in lowered_blob:
        stage = "delivered"
    elif tracking_numbers or tracking_urls or "shipped" in lowered_blob or "in_transit" in lowered_blob:
        stage = "in_transit"
    elif "production" in lowered_blob:
        stage = "in_production"

    stage_message = {
        "processing": "Order is received by Gelato and waiting for fulfillment updates.",
        "in_production": "Order is in production. Tracking appears after handover to shipping carrier.",
        "in_transit": "Order has shipped and is on the way.",
        "delivered": "Order is marked as delivered.",
    }.get(stage, "Order status available.")

    return {
        "found": True,
        "shopify_order_id": order_id,
        "gelato_order_id": str(order.get("id") or order.get("orderId") or "").strip(),
        "external_id": external_id,
        "status": status_value,
        "production_status": production_status,
        "shipping_status": shipping_status,
        "delivery_status": delivery_status,
        "stage": stage,
        "stage_message": stage_message,
        "eta": str(order.get("estimatedDeliveryDate") or order.get("deliveryDate") or order.get("eta") or "").strip(),
        "created_at": str(order.get("createdAt") or order.get("created") or "").strip(),
        "updated_at": str(order.get("updatedAt") or order.get("lastUpdated") or "").strip(),
        "recipient_name": recipient_name,
        "recipient_country": str(((recipient.get("address") if isinstance(recipient.get("address"), dict) else {}) or {}).get("country") or _find_first_string(order, ["country", "countryCode", "country_code"])).strip(),
        "tracking_numbers": tracking_numbers,
        "tracking_urls": tracking_urls,
        "carriers": carriers,
        "shipment_statuses": last_mile_statuses,
        "raw": order,
    }


def _get_or_discover_gelato_order(gelato_raw: dict, order_id: str) -> dict:
    link_map = gelato_raw.get("shopify_order_links") if isinstance(gelato_raw.get("shopify_order_links"), dict) else {}
    linked = link_map.get(order_id) if isinstance(link_map.get(order_id), dict) else {}
    linked_gelato_id = str(linked.get("gelato_order_id") or "").strip()
    external_id = f"shopify-{order_id}"

    if linked_gelato_id:
        detail_payload = _gelato_request(gelato_raw, "GET", f"orders/{linked_gelato_id}")
        normalized = _normalize_gelato_status_payload(order_id, detail_payload)
        if not normalized.get("external_id"):
            normalized["external_id"] = str(linked.get("external_id") or "").strip()
        if normalized.get("found"):
            return normalized

    for params in [
        {"externalId": external_id, "limit": 1},
        {"externalReferenceId": external_id, "limit": 1},
    ]:
        try:
            list_payload = _gelato_request(gelato_raw, "GET", "orders", params=params)
            order = _extract_first_order(list_payload)
            if order:
                normalized = _normalize_gelato_status_payload(order_id, order)
                if not normalized.get("external_id"):
                    normalized["external_id"] = str(linked.get("external_id") or "").strip()
                if normalized.get("found"):
                    return normalized
        except HTTPException:
            continue

    return {
        "found": False,
        "shopify_order_id": order_id,
        "external_id": external_id,
    }


def _shopify_order_for_user(db: Session, user_id: str, order_id: str) -> dict:
    raw = _get_raw_config(db, _shopify_key(user_id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopify config not found")

    domain = _normalize_shop_domain(raw.get("store_domain") or "")
    api_version = raw.get("api_version") or "2024-10"
    token = _decrypt_secret(raw, "access_token_enc", "access_token_iv")
    if not domain or not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incomplete Shopify configuration")

    url = f"https://{domain}/admin/api/{api_version}/orders/{order_id}.json"
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}

    with httpx.Client(timeout=20.0) as client:
        response = client.get(url, params={"status": "any"}, headers=headers)

    if response.status_code >= 400:
        detail = response.text[:400]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shopify API error ({response.status_code}): {detail}",
        )

    payload = response.json()
    order = payload.get("order")
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@router.get("/config")
def get_gelato_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, _gelato_key(str(current_user.id))) or {}
    return {
        "base_url": raw.get("base_url", "https://order.gelatoapis.com"),
        "has_api_key": bool(raw.get("api_key_enc") and raw.get("api_key_iv")),
        "sku_map": raw.get("sku_map", {}),
    }


@router.put("/config")
def save_gelato_config(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = str(current_user.id)
    raw = _get_raw_config(db, _gelato_key(user_id)) or {}
    base_url = (payload.get("base_url") or raw.get("base_url") or "https://order.gelatoapis.com").strip()
    api_key = (payload.get("api_key") or "").strip()
    sku_map = payload.get("sku_map") if isinstance(payload.get("sku_map"), dict) else raw.get("sku_map") or {}

    api_key_enc = raw.get("api_key_enc")
    api_key_iv = raw.get("api_key_iv")
    if api_key:
        api_key_enc, api_key_iv = _encrypt_secret(api_key)

    data = {
        "base_url": base_url,
        "api_key_enc": api_key_enc,
        "api_key_iv": api_key_iv,
        "sku_map": sku_map,
    }
    _save_config(db, _gelato_key(user_id), user_id, data)
    return {"message": "Gelato configuration saved"}


@router.get("/catalog")
def gelato_catalog(
    limit: int = Query(default=20, ge=1, le=100),
    page: int = Query(default=1, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw = _get_raw_config(db, _gelato_key(str(current_user.id)))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gelato config not found")
    return _gelato_request(raw, "GET", "products", params={"limit": limit, "page": page})


@router.post("/prices")
def gelato_prices(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, _gelato_key(str(current_user.id)))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gelato config not found")
    return _gelato_request(raw, "POST", "price", payload=payload)


@router.post("/orders")
def gelato_create_order(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, _gelato_key(str(current_user.id)))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gelato config not found")
    return _gelato_request(raw, "POST", "orders", payload=payload)


@router.post("/orders/from-shopify/{order_id}")
def gelato_create_from_shopify(order_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = str(current_user.id)
    gelato_raw = _get_raw_config(db, _gelato_key(user_id))
    if not gelato_raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gelato config not found")

    order = _shopify_order_for_user(db, user_id, order_id)
    sku_map = gelato_raw.get("sku_map") or {}

    shipping = order.get("shipping_address") or {}
    customer = order.get("customer") or {}
    email = order.get("email") or customer.get("email") or ""

    order_items = []
    missing_skus: list[str] = []
    for line in order.get("line_items") or []:
        sku = (line.get("sku") or "").strip()
        if not sku or sku not in sku_map:
            missing_skus.append(sku or "<empty>")
            continue
        order_items.append(
            {
                "productUid": sku_map[sku],
                "quantity": int(line.get("quantity") or 1),
                "files": [],
            }
        )

    if not order_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No order items could be mapped to Gelato products. "
                "Add SKU mapping in Settings > Gelato Integration. "
                f"Missing SKUs: {', '.join(missing_skus[:20])}"
            ),
        )

    gelato_payload = {
        "orderType": "order",
        "externalId": f"shopify-{order.get('id')}",
        "customerReference": order.get("name") or str(order.get("id") or ""),
        "currency": order.get("currency") or "USD",
        "items": order_items,
        "recipient": {
            "email": email,
            "phone": shipping.get("phone") or "",
            "firstName": shipping.get("first_name") or customer.get("first_name") or "",
            "lastName": shipping.get("last_name") or customer.get("last_name") or "",
            "address": {
                "line1": shipping.get("address1") or "",
                "line2": shipping.get("address2") or "",
                "city": shipping.get("city") or "",
                "state": shipping.get("province") or "",
                "postalCode": shipping.get("zip") or "",
                "country": shipping.get("country_code") or shipping.get("country") or "",
            },
        },
        "metadata": {
            "source": "shopify",
            "shopifyOrderId": str(order.get("id") or ""),
            "shopifyOrderName": order.get("name") or "",
        },
    }

    response = _gelato_request(gelato_raw, "POST", "orders", payload=gelato_payload)
    gelato_order_id = _extract_gelato_order_id(response)
    link_map = gelato_raw.get("shopify_order_links") if isinstance(gelato_raw.get("shopify_order_links"), dict) else {}
    updated_links = dict(link_map)
    updated_links[order_id] = {
        "gelato_order_id": gelato_order_id,
        "external_id": f"shopify-{order.get('id')}",
        "shopify_order_name": order.get("name") or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    updated_raw = dict(gelato_raw)
    updated_raw["shopify_order_links"] = updated_links
    _save_config(db, _gelato_key(user_id), user_id, updated_raw)

    return {
        "message": "Order sent to Gelato",
        "gelato_response": response,
        "gelato_order_id": gelato_order_id,
        "unmapped_skus": missing_skus,
    }


@router.get("/orders/from-shopify/{order_id}/status")
def gelato_status_from_shopify(order_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = str(current_user.id)
    gelato_raw = _get_raw_config(db, _gelato_key(user_id))
    if not gelato_raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gelato config not found")

    normalized = _get_or_discover_gelato_order(gelato_raw, order_id)
    if normalized.get("found"):
        gelato_order_id = str(normalized.get("gelato_order_id") or "").strip()
        if gelato_order_id:
            link_map = gelato_raw.get("shopify_order_links") if isinstance(gelato_raw.get("shopify_order_links"), dict) else {}
            updated_links = dict(link_map)
            updated_links[order_id] = {
                "gelato_order_id": gelato_order_id,
                "external_id": str(normalized.get("external_id") or "").strip(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            updated_raw = dict(gelato_raw)
            updated_raw["shopify_order_links"] = updated_links
            _save_config(db, _gelato_key(user_id), user_id, updated_raw)

    return normalized