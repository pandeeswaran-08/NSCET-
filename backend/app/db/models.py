"""SQLAlchemy 2.0 models."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Always returns timezone-aware UTC datetimes (SQLite drops tzinfo)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc) if value is not None else None

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Person(Base):
    __tablename__ = "persons"
    __table_args__ = (
        Index("ix_person_degree_dept", "degree", "department"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    degree: Mapped[str | None] = mapped_column(String(32), nullable=True)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    mean_embedding: Mapped[bytes] = mapped_column(LargeBinary)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    embeddings: Mapped[list["FaceEmbedding"]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )
    attendances: Mapped[list["Attendance"]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(32), default="faculty")  # "admin" | "faculty"
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), index=True)
    embedding: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    person: Mapped[Person] = relationship(back_populates="embeddings")


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("person_id", "att_date", "kind", name="uq_person_day_kind"),
        Index("ix_attendance_date_camera", "att_date", "camera_id"),
        Index("ix_attendance_date_kind", "att_date", "kind"),
        Index("ix_attendance_timestamp", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # check_in | check_out
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    att_date: Mapped[date] = mapped_column(Date)
    camera_id: Mapped[str] = mapped_column(String(64))
    confidence: Mapped[float] = mapped_column(Float)
    snapshot_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    person: Mapped[Person] = relationship(back_populates="attendances")
