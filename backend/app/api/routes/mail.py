import base64
import email
import html
import imaplib
import re
import smtplib
from email.header import decode_header, make_header
from email.utils import parseaddr
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps import get_current_user
from app.models import SystemSetting, User
from app.services.encryption import decrypt_bytes, encrypt_bytes

router = APIRouter()


_APP_BASE_URL = (settings.app_url or "http://localhost:3000").rstrip("/")
_DEFAULT_LOGO_URL = f"{_APP_BASE_URL}/Logo_tekst_CV.png"
_DEFAULT_LOGO_WHITE_URL = f"{_APP_BASE_URL}/Logo_tekst_CV_white.png"


DEFAULT_EMAIL_SIGNATURE_HTML = (
    '<style>'
    '.thokan-logo-dark{display:none !important;}'
    '@media (prefers-color-scheme: dark){'
    '.thokan-logo-light{display:none !important;}'
    '.thokan-logo-dark{display:block !important;}'
    '}'
    '</style>'
    '<div style="margin-top:16px;border-top:1px solid #d1d5db;padding-top:12px;'
    'font-family:Arial,sans-serif;font-size:13px;color:#111827;line-height:1.5;text-align:center;">'
    f'<img class="thokan-logo-light" src="{_DEFAULT_LOGO_URL}" alt="ThoKan" '
    'style="display:block;margin:0 auto 10px auto;max-height:44px;width:auto;">'
    f'<img class="thokan-logo-dark" src="{_DEFAULT_LOGO_WHITE_URL}" alt="ThoKan" '
    'style="display:none;margin:0 auto 10px auto;max-height:44px;width:auto;">'
    '<div style="font-size:16px;font-weight:700;letter-spacing:0.3px;">ThoKan</div>'
    '<div style="color:#374151;">BTW-nummer: 1034.077.111</div>'
    '<div style="color:#374151;">Tel: 0475 50 67 03</div>'
    '</div>'
)

DEFAULT_EMAIL_SIGNATURE_TEXT = "ThoKan\nBTW-nummer: 1034.077.111\nTel: 0475 50 67 03"


def _mail_key(user_id: str) -> str:
    return f"mailbox:{user_id}"


def _decode_mime(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _clean_snippet_text(value: str) -> str:
    text = value or ""
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _looks_like_css_noise(value: str) -> bool:
    sample = (value or "").lower()
    if not sample:
        return False
    css_markers = [
        "@media",
        "@font-face",
        "{",
        "}",
        ".button",
        "font-family:",
        "color:",
    ]
    marker_hits = sum(1 for marker in css_markers if marker in sample)
    return marker_hits >= 3


def _extract_text_snippet(message: email.message.Message) -> str:
    """Extract a plain text snippet from email, stripping HTML if needed."""
    text_content = ""
    html_content = ""
    
    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            disposition = (part.get("Content-Disposition") or "").lower()
            if "attachment" in disposition:
                continue
                
            try:
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                decoded = payload.decode(charset, errors="replace")
                
                if content_type == "text/plain" and not text_content:
                    text_content = decoded
                elif content_type == "text/html" and not html_content:
                    html_content = decoded
            except Exception:
                pass
    else:
        # Non-multipart: extract based on content type
        try:
            payload = message.get_payload(decode=True) or b""
            charset = message.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")
            
            content_type = message.get_content_type()
            if content_type == "text/html":
                html_content = decoded
            else:
                text_content = decoded
        except Exception:
            pass
    
    cleaned_text = _clean_snippet_text(text_content)
    cleaned_html = _clean_snippet_text(html_content)

    if cleaned_text and not _looks_like_css_noise(cleaned_text):
        return cleaned_text[:240]
    if cleaned_html:
        return cleaned_html[:240]
    if cleaned_text:
        return cleaned_text[:240]
    return ""


def _get_raw_config(db: Session, user_id: str) -> dict | None:
    row = db.get(SystemSetting, _mail_key(user_id))
    return row.value if row else None


def _decrypted_password(raw: dict) -> str:
    encrypted_b64 = raw.get("password_enc")
    iv = raw.get("password_iv")
    if not encrypted_b64 or not iv:
        return ""
    encrypted = base64.b64decode(encrypted_b64.encode("utf-8"))
    return decrypt_bytes(encrypted, iv).decode("utf-8")


def _save_config(db: Session, user_id: str, value: dict) -> None:
    row = db.get(SystemSetting, _mail_key(user_id))
    if not row:
        row = SystemSetting(key=_mail_key(user_id), value=value, updated_by=user_id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = user_id
    db.commit()


def _imap_client(config: dict):
    host = config["imap_host"]
    port = int(config.get("imap_port") or 993)
    use_ssl = bool(config.get("imap_use_ssl", True))
    username = config.get("username") or config.get("email")
    password = _decrypted_password(config)
    if use_ssl:
        client = imaplib.IMAP4_SSL(host, port)
    else:
        client = imaplib.IMAP4(host, port)
    client.login(username, password)
    return client


def _extract_email_address(value: str | None) -> str:
    return parseaddr(value or "")[1]


def _normalize_message_id(value: str | None) -> str:
    if not value:
        return ""
    cleaned = value.strip()
    if not cleaned:
        return ""
    matches = re.findall(r"<[^>]+>", cleaned)
    if matches:
        return matches[0]
    if cleaned.startswith("<") and cleaned.endswith(">"):
        return cleaned
    return f"<{cleaned}>"


def _extract_message_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return re.findall(r"<[^>]+>", value)


def _build_references(existing_references: str | None, in_reply_to: str | None, message_id: str | None) -> str:
    ids: list[str] = []
    for identifier in _extract_message_ids(existing_references):
        if identifier not in ids:
            ids.append(identifier)

    normalized_in_reply_to = _normalize_message_id(in_reply_to)
    if normalized_in_reply_to and normalized_in_reply_to not in ids:
        ids.append(normalized_in_reply_to)

    normalized_message_id = _normalize_message_id(message_id)
    if normalized_message_id and normalized_message_id not in ids:
        ids.append(normalized_message_id)

    return " ".join(ids)


def _looks_like_html(value: str) -> bool:
    return bool(re.search(r"<[^>]+>", value or ""))


def _to_html_preserving_lines(value: str) -> str:
    escaped = html.escape(value or "")
    return escaped.replace("\n", "<br>")


def _signature_parts(config: dict) -> tuple[str, str]:
    raw_signature = (config.get("email_signature") or "").strip()
    if not raw_signature:
        return DEFAULT_EMAIL_SIGNATURE_TEXT, DEFAULT_EMAIL_SIGNATURE_HTML
    if _looks_like_html(raw_signature):
        plain = _clean_snippet_text(raw_signature) or DEFAULT_EMAIL_SIGNATURE_TEXT
        return plain, raw_signature
    return raw_signature, _to_html_preserving_lines(raw_signature)


def _smtp_send(
    config: dict,
    to_email: str,
    subject: str,
    body: str,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> None:
    smtp_host = config.get("smtp_host") or settings.smtp_host
    smtp_port = int(config.get("smtp_port") or settings.smtp_port)
    smtp_user = config.get("smtp_user") or config.get("username") or config.get("email") or settings.smtp_user
    smtp_password = _decrypted_password(config) if config.get("password_enc") else settings.smtp_password
    smtp_use_ssl = bool(config.get("smtp_use_ssl", False))
    smtp_use_tls = bool(config.get("smtp_use_tls", True))
    from_email = config.get("email") or settings.smtp_from

    if not smtp_host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SMTP host not configured")

    signature_text, signature_html = _signature_parts(config)
    plain_body = (body or "").strip()
    full_plain_body = f"{plain_body}\n\n{signature_text}".strip()
    body_html = _to_html_preserving_lines(plain_body)
    full_html_body = f"<div>{body_html}</div>{signature_html}" if body_html else signature_html

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references

    msg.attach(MIMEText(full_plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(full_html_body, "html", "utf-8"))

    smtp_client = smtplib.SMTP_SSL if smtp_use_ssl else smtplib.SMTP
    with smtp_client(smtp_host, smtp_port) as server:
        if smtp_use_tls and not smtp_use_ssl:
            server.starttls()
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.send_message(msg)


@router.get("/config")
def get_mail_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        return {
            "email": current_user.email,
            "username": current_user.email,
            "imap_host": "",
            "imap_port": 993,
            "imap_use_ssl": True,
            "smtp_host": "",
            "smtp_port": 587,
            "smtp_use_tls": True,
            "smtp_use_ssl": False,
            "has_password": False,
            "email_signature": DEFAULT_EMAIL_SIGNATURE_HTML,
        }

    return {
        "email": raw.get("email") or current_user.email,
        "username": raw.get("username") or current_user.email,
        "imap_host": raw.get("imap_host", ""),
        "imap_port": raw.get("imap_port", 993),
        "imap_use_ssl": raw.get("imap_use_ssl", True),
        "smtp_host": raw.get("smtp_host", ""),
        "smtp_port": raw.get("smtp_port", 587),
        "smtp_use_tls": raw.get("smtp_use_tls", True),
        "smtp_use_ssl": raw.get("smtp_use_ssl", False),
        "has_password": bool(raw.get("password_enc")),
        "email_signature": raw.get("email_signature") or DEFAULT_EMAIL_SIGNATURE_HTML,
    }


@router.put("/config")
def save_mail_config(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    email_address = payload.get("email") or current_user.email
    username = payload.get("username") or email_address
    imap_host = payload.get("imap_host")
    smtp_host = payload.get("smtp_host") or ""
    email_signature = (payload.get("email_signature") or "").strip() or DEFAULT_EMAIL_SIGNATURE_HTML
    password = (payload.get("password") or "").strip()

    if not imap_host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="imap_host is required")

    existing = _get_raw_config(db, str(current_user.id)) or {}
    encoded_password = existing.get("password_enc")
    password_iv = existing.get("password_iv")
    if password:
        encrypted, iv = encrypt_bytes(password.encode("utf-8"))
        encoded_password = base64.b64encode(encrypted).decode("utf-8")
        password_iv = iv

    data = {
        "email": email_address,
        "username": username,
        "imap_host": imap_host,
        "imap_port": int(payload.get("imap_port") or 993),
        "imap_use_ssl": bool(payload.get("imap_use_ssl", True)),
        "smtp_host": smtp_host,
        "smtp_port": int(payload.get("smtp_port") or 587),
        "smtp_use_tls": bool(payload.get("smtp_use_tls", True)),
        "smtp_use_ssl": bool(payload.get("smtp_use_ssl", False)),
        "password_enc": encoded_password,
        "password_iv": password_iv,
        "email_signature": email_signature,
    }
    _save_config(db, str(current_user.id), data)
    return {"message": "Mailbox configuration saved"}


@router.post("/test")
def test_mail_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox config not found")

    try:
        client = _imap_client(raw)
        client.logout()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"IMAP connection failed: {exc}") from exc

    return {"message": "Mailbox connection successful"}


@router.get("/inbox")
def get_inbox(limit: int = 50, skip: int = 0, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox config not found")

    # Enforce max limit of 100
    limit = min(max(1, limit), 100)
    
    try:
        client = _imap_client(raw)
        client.select("INBOX")
        status_code, data = client.search(None, "ALL")
        if status_code != "OK":
            raise RuntimeError("Unable to fetch messages")

        ids = data[0].split()
        total_count = len(ids)
        
        # Apply pagination: skip from start, then take limit
        selected_ids = ids[-(skip + limit):-skip] if skip > 0 else ids[-limit:]
        
        messages = []
        for message_id in reversed(selected_ids):
            fetch_status, message_data = client.fetch(message_id, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
            if fetch_status != "OK" or not message_data:
                continue
            raw_message = message_data[0][1]
            parsed = email.message_from_bytes(raw_message)
            messages.append(
                {
                    "id": message_id.decode("utf-8", errors="ignore"),
                    "from": _decode_mime(parsed.get("From")),
                    "subject": _decode_mime(parsed.get("Subject")),
                    "date": parsed.get("Date", ""),
                    "snippet": "",
                }
            )
        client.logout()
        return {"messages": messages, "total": total_count, "limit": limit, "skip": skip}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Inbox fetch failed: {exc}") from exc


@router.get("/sent")
def get_sent(limit: int = 50, skip: int = 0, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fetch messages from Sent folder."""
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox config not found")

    limit = min(max(1, limit), 100)

    try:
        client = _imap_client(raw)
        sent_folder = _find_sent_folder(client)

        # Try selecting with quotes first (handles spaces and special chars)
        select_status, _ = client.select(f'"{sent_folder}"')
        if select_status != "OK":
            select_status, _ = client.select(sent_folder)
        if select_status != "OK":
            raise RuntimeError(f"Cannot open Sent folder: {sent_folder}")

        status_code, data = client.search(None, "ALL")
        if status_code != "OK":
            raise RuntimeError("Unable to fetch sent messages")

        ids = data[0].split()
        total_count = len(ids)

        selected_ids = ids[-(skip + limit):-skip] if skip > 0 else ids[-limit:]

        messages = []
        for message_id in reversed(selected_ids):
            fetch_status, message_data = client.fetch(message_id, "(BODY.PEEK[HEADER.FIELDS (TO SUBJECT DATE)])")
            if fetch_status != "OK" or not message_data:
                continue
            raw_message = message_data[0][1]
            parsed = email.message_from_bytes(raw_message)
            messages.append(
                {
                    "id": message_id.decode("utf-8", errors="ignore"),
                    "from": "",
                    "to": _decode_mime(parsed.get("To")),
                    "subject": _decode_mime(parsed.get("Subject")),
                    "date": parsed.get("Date", ""),
                    "snippet": "",
                }
            )
        client.logout()
        return {"messages": messages, "total": total_count, "limit": limit, "skip": skip, "folder": sent_folder}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Sent fetch failed: {exc}") from exc


@router.get("/message/{message_id}")
def get_message(message_id: str, folder: str = "INBOX", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fetch full message details including body."""
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox config not found")

    try:
        client = _imap_client(raw)
        if folder and folder.upper() != "INBOX":
            sel_status, _ = client.select(f'"{folder}"')
            if sel_status != "OK":
                client.select(folder)
        else:
            client.select("INBOX")
        fetch_status, message_data = client.fetch(message_id.encode(), "(RFC822)")
        if fetch_status != "OK" or not message_data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

        raw_message = message_data[0][1]
        parsed = email.message_from_bytes(raw_message)

        # Extract full body (text and html)
        text_body = ""
        html_body = ""
        if parsed.is_multipart():
            for part in parsed.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain" and not text_body:
                    try:
                        text_body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="ignore")
                    except Exception:
                        pass
                elif content_type == "text/html" and not html_body:
                    try:
                        html_body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="ignore")
                    except Exception:
                        pass
        else:
            # Non-multipart: check content type to determine if HTML or plain text
            try:
                payload = parsed.get_payload(decode=True)
                if payload:
                    charset = parsed.get_content_charset() or "utf-8"
                    decoded = payload.decode(charset, errors="ignore")
                    
                    # Check if it's HTML based on content type
                    content_type = parsed.get_content_type()
                    if content_type == "text/html":
                        html_body = decoded
                    else:
                        text_body = decoded
            except Exception:
                pass

        client.logout()
        return {
            "id": message_id,
            "from": _decode_mime(parsed.get("From")),
            "reply_to": _decode_mime(parsed.get("Reply-To")) or _decode_mime(parsed.get("From")),
            "to": _decode_mime(parsed.get("To")),
            "subject": _decode_mime(parsed.get("Subject")),
            "date": parsed.get("Date", ""),
            "message_id": parsed.get("Message-ID", ""),
            "in_reply_to": parsed.get("In-Reply-To", ""),
            "references": parsed.get("References", ""),
            "text_body": text_body,
            "html_body": html_body,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Message fetch failed: {exc}") from exc


def _find_sent_folder(client: imaplib.IMAP4_SSL | imaplib.IMAP4) -> str:
    """Find Sent folder on IMAP server, returns 'Sent' as fallback."""
    try:
        _, mailboxes = client.list()
        if not mailboxes:
            return "Sent"

        # Check for \\Sent attribute flag first (most reliable)
        for mailbox in mailboxes:
            if not mailbox:
                continue
            mailbox_bytes = mailbox if isinstance(mailbox, bytes) else mailbox.encode()
            if b"\\Sent" in mailbox_bytes:
                parts = mailbox_bytes.rsplit(b'"', 2)
                if len(parts) >= 2:
                    name = parts[-2].decode("utf-8", errors="ignore").strip()
                    if name:
                        return name
                parts = mailbox_bytes.rsplit(b" ", 1)
                return parts[-1].decode("utf-8", errors="ignore").strip().strip('"')

        # Fall back to name matching
        sent_patterns = [
            b"[Gmail]/Sent Mail",
            b"Sent Items",
            b"Sent Messages",
            b"INBOX.Sent",
            b"Sent Mail",
            b"Sent",
        ]
        for mailbox in mailboxes:
            if not mailbox:
                continue
            mailbox_bytes = mailbox if isinstance(mailbox, bytes) else mailbox.encode()
            mailbox_lower = mailbox_bytes.lower()
            for pattern in sent_patterns:
                if pattern.lower() in mailbox_lower:
                    parts = mailbox_bytes.rsplit(b'"', 2)
                    if len(parts) >= 2:
                        name = parts[-2].decode("utf-8", errors="ignore").strip()
                        if name:
                            return name
                    parts = mailbox_bytes.rsplit(b" ", 1)
                    return parts[-1].decode("utf-8", errors="ignore").strip().strip('"')

        return "Sent"
    except Exception:
        return "Sent"


def _find_trash_folder(client: imaplib.IMAP4_SSL | imaplib.IMAP4) -> str | None:
    """Find Trash/Deleted Items folder on IMAP server."""
    try:
        _, mailboxes = client.list()
        if not mailboxes:
            return None
        
        trash_patterns = [
            b"[Gmail]/Trash", b"[Gmail]/Bin", b"Trash", b"Deleted", 
            b"Deleted Items", b"[Sieve]/Trash", b".Trash", b"INBOX.Trash"
        ]
        
        for mailbox in mailboxes:
            mailbox_name = mailbox if isinstance(mailbox, bytes) else mailbox.encode()
            mailbox_lower = mailbox_name.lower()
            for pattern in trash_patterns:
                if pattern.lower() in mailbox_lower:
                    # Extract name from LIST response format: (...) "/" "FolderName"
                    parts = mailbox.split(b'"' if b'"' in mailbox else b' ')
                    for i, part in enumerate(parts):
                        if pattern.lower() in part.lower():
                            return part.decode('utf-8', errors='ignore').strip('"')
                    return mailbox_name.decode('utf-8', errors='ignore')
        
        return None
    except Exception:
        return None


@router.delete("/message/{message_id}")
def delete_message(message_id: str, folder: str = "INBOX", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox config not found")

    try:
        client = _imap_client(raw)
        if folder and folder.upper() != "INBOX":
            sel_status, _ = client.select(f'"{folder}"')
            if sel_status != "OK":
                client.select(folder)
        else:
            client.select("INBOX")

        fetch_status, message_data = client.fetch(message_id.encode(), "(RFC822)")
        if fetch_status != "OK" or not message_data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

        # Try to move to Trash folder first (more compatible)
        trash_folder = _find_trash_folder(client)
        if trash_folder:
            try:
                copy_status, _ = client.copy(message_id.encode(), trash_folder)
                if copy_status == "OK":
                    # Successfully copied to trash, now delete from inbox
                    client.store(message_id.encode(), "+FLAGS", "(\\Seen)")
                    try:
                        client.store(message_id.encode(), "+FLAGS", "(\\Deleted)")
                        client.expunge()
                    except Exception:
                        pass  # If flag/expunge fails, message is already in trash
                    client.logout()
                    return {"message": "Email deleted"}
            except Exception:
                pass  # Fall through to alternative deletion methods

        # Fallback: Try direct deletion with \Deleted flag
        try:
            store_status, _ = client.store(message_id.encode(), "+FLAGS", "(\\Deleted)")
            if store_status == "OK":
                expunge_status, _ = client.expunge()
                if expunge_status == "OK":
                    client.logout()
                    return {"message": "Email deleted"}
        except Exception:
            pass
        
        # If both methods fail, raise error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete message")
        
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Delete failed: {exc}") from exc


@router.post("/send")
def send_mail(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox config not found")

    to_email = payload.get("to")
    subject = payload.get("subject", "")
    body = payload.get("body", "")
    if not to_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recipient is required")

    try:
        _smtp_send(raw, to_email=to_email, subject=subject, body=body)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Send failed: {exc}") from exc

    return {"message": "Email sent"}


@router.post("/reply")
def reply_mail(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Reply to an email message."""
    raw = _get_raw_config(db, str(current_user.id))
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox config not found")

    original_from = payload.get("reply_to") or payload.get("from")
    original_subject = payload.get("subject", "")
    reply_body = payload.get("body", "")
    original_message_id = payload.get("message_id", "")
    original_in_reply_to = payload.get("in_reply_to", "")
    original_references = payload.get("references", "")
    
    recipient = _extract_email_address(original_from)
    if not recipient:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reply-to address is required")

    # Auto-prepend "Re:" if not already there
    reply_subject = original_subject if original_subject.lower().startswith("re:") else f"Re: {original_subject}"

    in_reply_to = _normalize_message_id(original_message_id) or _normalize_message_id(original_in_reply_to)
    references = _build_references(original_references, original_in_reply_to, original_message_id)

    try:
        _smtp_send(
            raw,
            to_email=recipient,
            subject=reply_subject,
            body=reply_body,
            in_reply_to=in_reply_to or None,
            references=references or None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reply failed: {exc}") from exc

    return {"message": "Reply sent"}
