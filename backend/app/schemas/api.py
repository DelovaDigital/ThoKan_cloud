from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    totp_code: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: datetime


class RefreshRequest(BaseModel):
    refresh_token: str


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=140)
    password: str = Field(min_length=8)
    role: str = "employee"


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    is_active: bool
    roles: list[str]


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: UUID | None = None


class FolderResponse(BaseModel):
    id: UUID
    name: str
    parent_id: UUID | None
    owner_id: UUID
    path: str


class FileResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    folder_id: UUID | None
    size_bytes: int
    mime_type: str
    created_at: datetime


class RenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class MoveRequest(BaseModel):
    folder_id: UUID | None = None


class ShareUserRequest(BaseModel):
    target_user_id: UUID
    can_read: bool = True
    can_write: bool = False
    can_delete: bool = False
    can_share: bool = False


class ShareLinkRequest(BaseModel):
    expires_at: datetime | None = None
    password: str | None = None
    max_downloads: int | None = Field(default=None, ge=1)


class ShareLinkResponse(BaseModel):
    link_id: UUID
    token: str
    expires_at: datetime | None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class DashboardResponse(BaseModel):
    used_bytes: int
    files_count: int
    recent_files: list[FileResponse]
    recent_activity: list[dict]
    system_info: dict
