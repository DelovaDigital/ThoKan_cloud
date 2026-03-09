from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
from starlette.middleware.sessions import SessionMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.rate_limit import limiter
from app.core.security_headers import SecurityHeadersMiddleware


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="1.0.0", openapi_url="/api/openapi.json")

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(SessionMiddleware, secret_key=settings.csrf_secret)
    app.add_middleware(CSRFMiddleware)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "thokan-cloud-api"}

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
