"""Seed demo persons + 14 days of attendance (random embeddings; no models needed).

Usage: python scripts/seed_data.py
Note: seeded persons use random embeddings, so they won't match real faces. Dashboard demo only.
"""
import sys as _sys
from pathlib import Path as _P
_sys.path.insert(0, str(_P(__file__).resolve().parents[1]))

import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np

from app.core.config import get_settings
from app.db.session import create_all
from app.services.container import Container
from app.utils.image import l2_normalize

NAMES = ["Arun Kumar", "Divya S", "Karthik R", "Meena P", "Naveen V", "Priya M", "Rahul T", "Sneha K"]


def main() -> None:
    s = get_settings()
    c = Container(s)
    create_all(c.db_engine)
    tz = ZoneInfo(s.timezone)
    rng = np.random.default_rng(7)
    persons = []
    for i, n in enumerate(NAMES, 1):
        code = f"DEMO{i:03d}"
        p = c.repo.get_by_code(code)
        if p is None:
            e = l2_normalize(rng.normal(size=512))
            deg, dept = random.choice([("BE", "CSE"), ("BE", "ECE"), ("BE", "MECH"), ("B.Tech", "IT"), ("B.Tech", "AIDS")])
            p = c.repo.create_person(code=code, name=n, degree=deg, department=dept, mean=e, embeddings=[e])
        persons.append(p)
    now = datetime.now(timezone.utc)
    added = 0
    for d in range(14):
        day = (now - timedelta(days=d)).astimezone(tz).date()
        for p in persons:
            if random.random() < 0.8:
                ci = datetime(day.year, day.month, day.day, 9, random.randint(0, 40), tzinfo=tz)
                added += bool(c.repo.record_attendance(p.id, "check_in", ci, day, "cam0", round(random.uniform(0.55, 0.9), 2), None))
                co = ci + timedelta(hours=8, minutes=random.randint(0, 30))
                added += bool(c.repo.record_attendance(p.id, "check_out", co, day, "cam0", round(random.uniform(0.55, 0.9), 2), None))
    c.gallery.rebuild()
    print(f"Seeded {len(persons)} persons, {added} attendance rows")


if __name__ == "__main__":
    main()
