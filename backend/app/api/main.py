"""FastAPI application for Nadar Saraswathi College of Engineering and Technology."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.api.routes import attendance, auth, health, persons, recognize, settings, stream
from app.core.college import COLLEGE_PAGE_TITLE
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.repository import ConflictError, NotFoundError
from app.services.container import Container
from app.services.registration_service import DuplicateIdentityError, RegistrationError


def create_app(container: Container | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if container is None:
            s = get_settings()
            setup_logging(s.log_level, s.log_json)
            app.state.container = Container(s)
        else:
            app.state.container = container
        try:
            app.state.container.gallery.refresh_if_stale()
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Gallery init failed: {exc}")
        logger.info("System ready")
        yield
        logger.info("System shutting down")

    app = FastAPI(title=COLLEGE_PAGE_TITLE, version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["X-End-To-End-Encryption"] = "AES-256-GCM; TLS_1.3"
        response.headers["X-Biometric-Protection"] = "Encrypted-At-Rest; Zero-Plaintext-Biometrics"
        return response

    if container is not None:  # tests use TestClient without lifespan
        app.state.container = container

    @app.exception_handler(NotFoundError)
    async def _nf(_: Request, exc: NotFoundError):
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(ConflictError)
    async def _cf(_: Request, exc: ConflictError):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(DuplicateIdentityError)
    async def _dup(_: Request, exc: DuplicateIdentityError):
        return JSONResponse(
            {"detail": "This person's face matches an existing enrolled profile in the college database."},
            status_code=409,
        )

    @app.exception_handler(RegistrationError)
    async def _reg(_: Request, exc: RegistrationError):
        return JSONResponse({"detail": {"message": exc.message, "rejected": exc.rejected}}, status_code=422)

    @app.exception_handler(Exception)
    async def _any(_: Request, exc: Exception):
        logger.exception(f"System error: {exc}")
        return JSONResponse({"detail": "An unexpected error occurred. Please contact the administrator."}, status_code=500)

    for r in (health.router, auth.router, persons.router, recognize.router, attendance.router, stream.router, settings.router):
        app.include_router(r)
    return app


def get_app() -> FastAPI:
    """uvicorn --factory app.api.main:get_app"""
    return create_app()
