from __future__ import annotations

import os
from pathlib import Path

import boto3

from app.core.config import settings


class StorageDriver:
    def save(self, key: str, data: bytes) -> None:
        raise NotImplementedError

    def read(self, key: str) -> bytes:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError


class LocalStorageDriver(StorageDriver):
    def __init__(self, root: str):
        self.root = resolve_local_storage_root(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path_for(self, key: str) -> Path:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def save(self, key: str, data: bytes) -> None:
        path = self._path_for(key)
        path.write_bytes(data)

    def read(self, key: str) -> bytes:
        return self._path_for(key).read_bytes()

    def delete(self, key: str) -> None:
        path = self._path_for(key)
        if path.exists():
            path.unlink()


class S3StorageDriver(StorageDriver):
    def __init__(self) -> None:
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
        self.bucket = settings.s3_bucket

    def save(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)

    def read(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


def get_local_storage_roots(configured_root: str | None = None) -> list[Path]:
    configured = configured_root or settings.storage_local_root
    root = Path(configured)
    app_root = Path(__file__).resolve().parents[2]

    candidates: list[Path] = []

    def _add(path: Path) -> None:
        resolved = path.expanduser().resolve()
        if resolved not in candidates:
            candidates.append(resolved)

    if root.is_absolute():
        _add(root)
    else:
        _add(Path.cwd() / root)
        _add(app_root / root)
        if root.name:
            _add(Path("/app") / root.name)
            _add(Path("/host_repo") / root.name)

    # Cloud/production fallbacks for installs where compose/env paths changed
    storage_env = os.environ.get("STORAGE_HOST_PATH")
    if storage_env:
        _add(Path(storage_env))

    install_root_env = os.environ.get("THOKAN_TARGET_ROOT") or os.environ.get("THOKAN_INSTALL_ROOT")
    if install_root_env:
        _add(Path(install_root_env) / "storage")

    host_repo_env = os.environ.get("THOKAN_HOST_REPO_PATH")
    if host_repo_env:
        _add(Path(host_repo_env) / "storage")

    _add(Path("/opt/thokan-cloud/storage"))
    _add(Path("/home/thokan/ThoKan_cloud/storage"))

    return candidates


def resolve_local_storage_root(configured_root: str | None = None) -> Path:
    candidates = get_local_storage_roots(configured_root)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def get_storage_driver() -> StorageDriver:
    if settings.storage_driver.lower() == "s3":
        return S3StorageDriver()
    return LocalStorageDriver(settings.storage_local_root)
