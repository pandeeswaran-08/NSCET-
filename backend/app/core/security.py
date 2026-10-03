"""Authentication, JWT token management, and password hashing security utilities."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt


def hash_password(password: str) -> str:
    """Hash plain-text password using bcrypt with salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain-text password against bcrypt hashed password."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    data: dict[str, Any],
    secret_key: str,
    algorithm: str = "HS256",
    expires_delta: timedelta | None = None,
) -> str:
    """Create signed JWT access token with expiration."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=24)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, secret_key, algorithm=algorithm)


def decode_access_token(
    token: str,
    secret_key: str,
    algorithm: str = "HS256",
) -> dict[str, Any] | None:
    """Decode and validate JWT access token."""
    try:
        return jwt.decode(token, secret_key, algorithms=[algorithm])
    except jwt.PyJWTError:
        return None


def validate_email_domain(email: str, allowed_domain: str) -> bool:
    """Validate that the user email belongs to the college domain."""
    email_clean = email.strip().lower()
    domain_clean = allowed_domain.strip().lower().lstrip("@")
    if not email_clean or "@" not in email_clean:
        return False
    user_part, email_domain = email_clean.rsplit("@", 1)
    if not user_part:
        return False
    return email_domain == domain_clean or email_domain.endswith("." + domain_clean)
