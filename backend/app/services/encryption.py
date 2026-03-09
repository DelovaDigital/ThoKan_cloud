import base64
import hashlib
import os

from app.core.config import settings


def _derive_key() -> bytes:
    return hashlib.sha256(settings.storage_encryption_key.encode("utf-8")).digest()


def encrypt_bytes(data: bytes) -> tuple[bytes, str]:
    key = _derive_key()
    iv = os.urandom(16)
    encrypted = bytes(data[i] ^ key[i % len(key)] ^ iv[i % len(iv)] for i in range(len(data)))
    return encrypted, base64.b64encode(iv).decode("utf-8")


def decrypt_bytes(data: bytes, iv_b64: str) -> bytes:
    key = _derive_key()
    iv = base64.b64decode(iv_b64.encode("utf-8"))
    return bytes(data[i] ^ key[i % len(key)] ^ iv[i % len(iv)] for i in range(len(data)))
