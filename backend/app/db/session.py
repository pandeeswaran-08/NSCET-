"""Engine / session factory."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        if ":memory:" in url:
            return create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
        path = url.split("///", 1)[-1]
        if path:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=10)


def make_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


from sqlalchemy import text


def create_all(engine: Engine) -> None:
    """Dev/test convenience; Postgres deployments use Alembic."""
    Base.metadata.create_all(engine)
    # Ensure backward compatibility for newly added columns if SQLite
    try:
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(persons)")).fetchall()
            cols = [r[1] for r in res]
            if cols and "year" not in cols:
                conn.execute(text("ALTER TABLE persons ADD COLUMN year INTEGER"))
                conn.commit()
    except Exception:
        pass
