from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app.db.repository import ConflictError


def _person(c, code="E1", degree="BE", department="CSE"):
    emb = np.ones(512, np.float32) / 22.6
    return c.repo.create_person(code=code, name="Alice", degree=degree, department=department, mean=emb, embeddings=[emb])


def test_checkin_once_then_cooldown(container):
    p = _person(container)
    now = datetime(2026, 10, 2, 4, 0, tzinfo=timezone.utc)
    first = container.attendance.mark(p.id, "cam0", 0.8, now=now)
    assert first and first.kind == "check_in"
    assert container.attendance.mark(p.id, "cam0", 0.8, now=now) is None  # redis/kv cooldown


def test_db_unique_constraint_blocks_duplicates(container):
    p = _person(container)
    now = datetime(2026, 10, 2, 4, 0, tzinfo=timezone.utc)
    d = now.date()
    assert container.repo.record_attendance(p.id, "check_in", now, d, "c", 0.9, None) is not None
    assert container.repo.record_attendance(p.id, "check_in", now, d, "c", 0.9, None) is None


def test_auto_checkout_after_gap(container):
    p = _person(container)
    t0 = datetime(2026, 10, 2, 4, 0, tzinfo=timezone.utc)
    assert container.attendance.mark(p.id, "cam0", 0.8, now=t0).kind == "check_in"
    container.kv.delete(f"cooldown:{p.id}")
    assert container.attendance.mark(p.id, "cam0", 0.8, now=t0 + timedelta(minutes=10)) is None  # too soon
    container.kv.delete(f"cooldown:{p.id}")
    ev = container.attendance.mark(p.id, "cam0", 0.8, now=t0 + timedelta(hours=2))
    assert ev and ev.kind == "check_out"
    container.kv.delete(f"cooldown:{p.id}")
    assert container.attendance.mark(p.id, "cam0", 0.8, now=t0 + timedelta(hours=3)).kind == "check_out"  # upsert
    rows = container.repo.query_attendance()
    assert sorted(r["kind"] for r in rows) == ["check_in", "check_out"]


def test_attendance_degree_dept_filters(container):
    p1 = _person(container, code="STU01", degree="BE", department="CSE")
    p2 = _person(container, code="STU02", degree="B.Tech", department="AIDS")
    t0 = datetime(2026, 10, 2, 4, 0, tzinfo=timezone.utc)
    container.attendance.mark(p1.id, "gate1", 0.85, now=t0)
    container.attendance.mark(p2.id, "gate1", 0.88, now=t0)

    be_rows = container.repo.query_attendance(degree="BE")
    assert len(be_rows) == 1 and be_rows[0]["person_code"] == "STU01"

    aids_rows = container.repo.query_attendance(department="AIDS")
    assert len(aids_rows) == 1 and aids_rows[0]["person_code"] == "STU02"


def test_duplicate_person_code(container):
    _person(container)
    with pytest.raises(ConflictError):
        _person(container)
