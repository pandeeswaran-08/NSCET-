"""FastAPI dependency providers: container, JWT authentication, roles, and kiosk authorization."""
from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.db.models import User
from app.services.container import Container

security_bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


def get_current_user_optional(
    auth: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    c: Container = Depends(get_container),
) -> User | None:
    """Extract and validate current user from JWT if present."""
    if not auth or not auth.credentials:
        return None
    payload = decode_access_token(
        auth.credentials,
        secret_key=c.settings.jwt_secret,
        algorithm=c.settings.jwt_algorithm,
    )
    if not payload or "sub" not in payload:
        return None
    user = c.repo.get_user_by_email(payload["sub"])
    if user is None or not user.active:
        return None
    return user


def get_current_user(
    user: User | None = Depends(get_current_user_optional),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    c: Container = Depends(get_container),
) -> User:
    """Enforce authenticated user via JWT (with system test API-key fallback for automated suites)."""
    if user is not None:
        return user

    # Fallback for existing unit/integration test suites that pass X-API-Key
    if x_api_key and secrets.compare_digest(x_api_key, c.settings.api_key):
        return User(
            id=1,
            email=f"admin@{c.settings.allowed_email_domain}",
            full_name="System Admin",
            role="admin",
            active=True,
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Please sign in with your college credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Ensure authenticated user has Admin privileges."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: Administrator privileges required.",
        )
    return current_user


def require_faculty_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """Ensure authenticated user is faculty or administrator."""
    if current_user.role not in {"admin", "faculty"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to authorized faculty and administrators.",
        )
    return current_user


def require_kiosk_or_auth(
    user: User | None = Depends(get_current_user_optional),
    x_kiosk_token: str | None = Header(None, alias="X-Kiosk-Token"),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    c: Container = Depends(get_container),
) -> None:
    """Allow scanner requests via Kiosk token, Bearer JWT, or API key."""
    if user is not None:
        return
    if x_kiosk_token and secrets.compare_digest(x_kiosk_token, c.settings.kiosk_token):
        return
    if x_api_key and (
        secrets.compare_digest(x_api_key, c.settings.kiosk_token)
        or secrets.compare_digest(x_api_key, c.settings.api_key)
    ):
        return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Scanner authorization required. Please provide a valid kiosk token.",
    )


# Backward compatibility alias
def require_api_key(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    user: User | None = Depends(get_current_user_optional),
    c: Container = Depends(get_container),
) -> None:
    if user is not None:
        return
    if x_api_key and (
        secrets.compare_digest(x_api_key, c.settings.api_key)
        or secrets.compare_digest(x_api_key, c.settings.kiosk_token)
    ):
        return
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing credentials")
