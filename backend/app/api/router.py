from fastapi import APIRouter

from app.api.routes import admin, auth, dashboard, files, folders, mail, permissions, sharing, system

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(folders.router, prefix="/folders", tags=["folders"])
api_router.include_router(permissions.router, prefix="/permissions", tags=["permissions"])
api_router.include_router(sharing.router, prefix="/sharing", tags=["sharing"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(mail.router, prefix="/mail", tags=["mail"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(system.router, prefix="/system", tags=["system"])
