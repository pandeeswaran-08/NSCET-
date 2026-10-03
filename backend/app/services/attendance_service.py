"""Attendance marking: Redis cooldown (hot path) + DB unique constraint (source of truth)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import cv2
import numpy as np
from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.core.interfaces import KeyValueStore
from app.core.types import AttendanceEvent
from app.db.repository import Repository
from app.utils.image import expand_box


class AttendanceService:
    def __init__(self, repo: Repository, kv: KeyValueStore, settings: Settings) -> None:
        self.repo, self.kv, self.s = repo, kv, settings
        self.tz = ZoneInfo(settings.timezone)

    def _save_snapshot(self, frame: np.ndarray, bbox, person_id: int, ts: datetime) -> str | None:
        if not self.s.store_snapshots or frame is None:
            return None
        try:
            x1, y1, x2, y2 = expand_box(bbox, 0.3, frame.shape) if bbox is not None else (0, 0, *frame.shape[1::-1])
            folder = Path(self.s.snapshots_dir) / ts.astimezone(self.tz).strftime("%Y-%m-%d")
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / f"{person_id}_{ts.strftime('%H%M%S%f')}.jpg"
            cv2.imwrite(str(path), frame[y1:y2, x1:x2])
            return str(path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Snapshot failed: {exc}")
            return None

    def mark(self, person_id: int, camera_id: str, confidence: float, *, frame: np.ndarray | None = None,
             bbox=None, mode: str = "auto", now: datetime | None = None,
             person_name: str = "") -> AttendanceEvent | None:
        now = now or datetime.now(timezone.utc)
        day = now.astimezone(self.tz).date()
        key = f"cooldown:{person_id}"
        if not self.kv.set_nx(key, self.s.attendance_cooldown_s):
            return None
        try:
            if mode == "auto":
                ci = self.repo.get_day_record(person_id, day, "check_in")
                if ci is None:
                    kind = "check_in"
                elif now - ci.timestamp >= timedelta(minutes=self.s.min_checkout_gap_min):
                    kind = "check_out"
                else:
                    return None
            else:
                kind = mode
            snap = self._save_snapshot(frame, bbox, person_id, now) if frame is not None else None
            row = self.repo.record_attendance(person_id, kind, now, day, camera_id, float(confidence), snap)
            if row is None:
                if snap:
                    Path(snap).unlink(missing_ok=True)
                return None
            logger.info(f"Attendance {kind}: person={person_id} cam={camera_id} conf={confidence:.2f}")
            return AttendanceEvent(person_id, person_name, kind, now, camera_id, float(confidence), snap)
        except SQLAlchemyError as exc:
            self.kv.delete(key)  # let the next sighting retry once the DB is back
            logger.error(f"DB error while marking attendance: {exc}")
            return None
