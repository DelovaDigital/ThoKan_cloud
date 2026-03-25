from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
from starlette.middleware.gzip import GZipMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.rate_limit import limiter
from app.core.security_headers import SecurityHeadersMiddleware
from app.core.versioning import get_runtime_version
from app.services.mail_push_watcher import mail_push_watcher
from app.services.shopify_order_push_watcher import shopify_order_push_watcher


@asynccontextmanager
async def lifespan(_app: FastAPI):
    mail_push_watcher.start()
    shopify_order_push_watcher.start()
    try:
        yield
    finally:
        await shopify_order_push_watcher.stop()
        await mail_push_watcher.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=get_runtime_version(),
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Middleware stack (order matters)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(CSRFMiddleware)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "thokan-cloud-api"}

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
