"""Persistence layer."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import numpy as np
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.crypto import decrypt_biometric_bytes, encrypt_biometric_bytes
from app.db.models import Attendance, FaceEmbedding, Person, User


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


@dataclass(slots=True)
class GalleryRow:
    person_id: int
    name: str
    mean: np.ndarray
    embeddings: list[np.ndarray]


def emb_to_bytes(v: np.ndarray) -> bytes:
    raw = np.asarray(v, dtype=np.float32).tobytes()
    return encrypt_biometric_bytes(raw)


def bytes_to_emb(b: bytes) -> np.ndarray:
    raw = decrypt_biometric_bytes(b)
    return np.frombuffer(raw, dtype=np.float32).copy()


class Repository:
    def __init__(self, session_factory: sessionmaker) -> None:
        self._sf = session_factory

    # ---------- health ----------
    def ping(self) -> bool:
        try:
            with self._sf() as s:
                s.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    # ---------- users & auth ----------
    def create_user(self, email: str, hashed_password: str, full_name: str, role: str = "faculty") -> User:
        with self._sf() as s:
            u = User(email=email.strip().lower(), hashed_password=hashed_password,
                     full_name=full_name.strip(), role=role)
            s.add(u)
            try:
                s.commit()
            except IntegrityError as exc:
                s.rollback()
                raise ConflictError(f"User email '{email}' already exists") from exc
            return u

    def get_user_by_email(self, email: str) -> User | None:
        with self._sf() as s:
            return s.scalar(select(User).where(User.email == email.strip().lower()))

    def get_user_by_id(self, user_id: int) -> User | None:
        with self._sf() as s:
            return s.get(User, user_id)

    def list_users(self) -> list[User]:
        with self._sf() as s:
            return list(s.scalars(select(User).order_by(User.id)))

    # ---------- persons ----------
    def create_person(self, code: str, name: str, degree: str | None = None,
                      department: str | None = None, year: int | None = None,
                      mean: np.ndarray | None = None,
                      embeddings: list[np.ndarray] | None = None) -> Person:
        with self._sf() as s:
            mean_bytes = emb_to_bytes(mean) if mean is not None else b""
            p = Person(code=code, name=name, degree=degree, department=department, year=year, mean_embedding=mean_bytes)
            if embeddings:
                p.embeddings = [FaceEmbedding(embedding=emb_to_bytes(e)) for e in embeddings]
            s.add(p)
            try:
                s.commit()
            except IntegrityError as exc:
                s.rollback()
                raise ConflictError(f"Person code '{code}' already exists") from exc
            return p

    def get_person(self, person_id: int) -> Person:
        with self._sf() as s:
            p = s.get(Person, person_id)
            if p is None:
                raise NotFoundError(f"Person {person_id} not found")
            return p

    def get_by_code(self, code: str) -> Person | None:
        with self._sf() as s:
            return s.scalar(select(Person).where(Person.code == code))

    def list_persons(self, active_only: bool = False, limit: int = 500, offset: int = 0) -> list[Person]:
        with self._sf() as s:
            q = select(Person).order_by(Person.id).limit(limit).offset(offset)
            if active_only:
                q = q.where(Person.active.is_(True))
            return list(s.scalars(q))

    def update_person(self, person_id: int, **fields) -> Person:
        with self._sf() as s:
            p = s.get(Person, person_id)
            if p is None:
                raise NotFoundError(f"Person {person_id} not found")
            for k, v in fields.items():
                if v is not None and k in {"name", "degree", "department", "year", "active"}:
                    setattr(p, k, v)
            s.commit()
            return p

    def delete_person(self, person_id: int) -> None:
        with self._sf() as s:
            p = s.get(Person, person_id)
            if p is None:
                raise NotFoundError(f"Person {person_id} not found")
            s.delete(p)
            s.commit()

    def count_persons(self, active_only: bool = False) -> int:
        with self._sf() as s:
            q = select(func.count(Person.id))
            if active_only:
                q = q.where(Person.active.is_(True))
            return s.scalar(q) or 0

    def gallery_rows(self) -> list[GalleryRow]:
        with self._sf() as s:
            rows: list[GalleryRow] = []
            for p in s.scalars(select(Person).where(Person.active.is_(True)).order_by(Person.id)):
                rows.append(GalleryRow(
                    person_id=p.id, name=p.name, mean=bytes_to_emb(p.mean_embedding),
                    embeddings=[bytes_to_emb(e.embedding) for e in p.embeddings],
                ))
            return rows

    # ---------- attendance ----------
    def record_attendance(self, person_id: int, kind: str, ts: datetime, att_date: date,
                          camera_id: str, confidence: float, snapshot_path: str | None) -> Attendance | None:
        """check_in: insert-once (None if already exists). check_out: upsert latest."""
        with self._sf() as s:
            if kind == "check_out":
                row = s.scalar(select(Attendance).where(
                    Attendance.person_id == person_id, Attendance.att_date == att_date,
                    Attendance.kind == "check_out"))
                if row is not None:
                    row.timestamp, row.camera_id, row.confidence = ts, camera_id, confidence
                    if snapshot_path:
                        row.snapshot_path = snapshot_path
                    s.commit()
                    return row
            row = Attendance(person_id=person_id, kind=kind, timestamp=ts, att_date=att_date,
                             camera_id=camera_id, confidence=confidence, snapshot_path=snapshot_path)
            s.add(row)
            try:
                s.commit()
            except IntegrityError:
                s.rollback()
                return None
            return row

    def get_day_record(self, person_id: int, att_date: date, kind: str) -> Attendance | None:
        with self._sf() as s:
            return s.scalar(select(Attendance).where(
                Attendance.person_id == person_id, Attendance.att_date == att_date, Attendance.kind == kind))

    def query_attendance(self, start: date | None = None, end: date | None = None,
                         person_id: int | None = None, camera_id: str | None = None,
                         kind: str | None = None, degree: str | None = None,
                         department: str | None = None, year: int | None = None,
                         limit: int = 1000, offset: int = 0) -> list[dict]:
        with self._sf() as s:
            q = (select(Attendance, Person.name, Person.code, Person.degree, Person.department, Person.year)
                 .join(Person, Person.id == Attendance.person_id)
                 .order_by(Attendance.timestamp.desc()).limit(limit).offset(offset))
            if start:
                q = q.where(Attendance.att_date >= start)
            if end:
                q = q.where(Attendance.att_date <= end)
            if person_id:
                q = q.where(Attendance.person_id == person_id)
            if camera_id:
                q = q.where(Attendance.camera_id == camera_id)
            if kind:
                q = q.where(Attendance.kind == kind)
            if degree:
                q = q.where(Person.degree == degree)
            if department:
                q = q.where(Person.department == department)
            if year:
                q = q.where(Person.year == year)
            return [
                dict(id=a.id, person_id=a.person_id, person_name=name, person_code=code,
                     degree=deg, department=dept, year=yr, kind=a.kind,
                     timestamp=a.timestamp, date=a.att_date, camera_id=a.camera_id,
                     confidence=a.confidence, snapshot_path=a.snapshot_path)
                for a, name, code, deg, dept, yr in s.execute(q).all()
            ]

    def count_attendance(self, start: date | None = None, end: date | None = None,
                         person_id: int | None = None, camera_id: str | None = None,
                         kind: str | None = None, degree: str | None = None,
                         department: str | None = None, year: int | None = None) -> int:
        with self._sf() as s:
            q = select(func.count(Attendance.id)).join(Person, Person.id == Attendance.person_id)
            if start:
                q = q.where(Attendance.att_date >= start)
            if end:
                q = q.where(Attendance.att_date <= end)
            if person_id:
                q = q.where(Attendance.person_id == person_id)
            if camera_id:
                q = q.where(Attendance.camera_id == camera_id)
            if kind:
                q = q.where(Attendance.kind == kind)
            if degree:
                q = q.where(Person.degree == degree)
            if department:
                q = q.where(Person.department == department)
            if year:
                q = q.where(Person.year == year)
            return int(s.scalar(q) or 0)

    def daily_counts(self, start: date, end: date, degree: str | None = None,
                     department: str | None = None, year: int | None = None) -> list[tuple[date, int]]:
        with self._sf() as s:
            q = (select(Attendance.att_date, func.count(func.distinct(Attendance.person_id)))
                 .join(Person, Person.id == Attendance.person_id)
                 .where(Attendance.att_date >= start, Attendance.att_date <= end, Attendance.kind == "check_in"))
            if degree:
                q = q.where(Person.degree == degree)
            if department:
                q = q.where(Person.department == department)
            if year:
                q = q.where(Person.year == year)
            q = q.group_by(Attendance.att_date).order_by(Attendance.att_date)
            return [(d, int(c)) for d, c in s.execute(q).all()]

    def purge_older_than(self, days: int) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        with self._sf() as s:
            res = s.execute(delete(Attendance).where(Attendance.timestamp < cutoff))
            s.commit()
            return res.rowcount or 0
