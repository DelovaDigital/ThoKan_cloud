import secrets

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/password-reset/request",
    "/api/v1/auth/password-reset/confirm",
    "/api/v1/sharing/links",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        is_exempt = any(request.url.path.startswith(path) for path in CSRF_EXEMPT_PATHS)
        if request.method not in SAFE_METHODS and request.url.path.startswith("/api/") and not is_exempt:
            csrf_cookie = request.cookies.get("csrf_token")
            csrf_header = request.headers.get("x-csrf-token")
            if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token missing or invalid")

        response: Response = await call_next(request)
        if not request.cookies.get("csrf_token"):
            response.set_cookie(
                "csrf_token",
                secrets.token_urlsafe(32),
                httponly=False,
                secure=False,
                samesite="lax",
            )
        return response
