"""Single-image recognition (REST)."""
from __future__ import annotations

from typing import Callable

import numpy as np

from app.core.config import Settings
from app.recognition.engine import RecognitionEngine
from app.recognition.gallery import Gallery
from app.services.attendance_service import AttendanceService


class RecognitionService:
    def __init__(self, get_engine: Callable[[], RecognitionEngine], gallery: Gallery,
                 attendance: AttendanceService, settings: Settings) -> None:
        self._get_engine, self.gallery, self.attendance, self.s = get_engine, gallery, attendance, settings

    def recognize(self, image: np.ndarray, camera_id: str = "api", mark: bool = False) -> list[dict]:
        faces = self._get_engine().analyze_frames([image], match=True)[0]
        out = []
        for f in faces:
            marked = None
            is_spoof = f.extra.get("is_spoof", False)
            anti_spoof = f.extra.get("anti_spoof")
            spoof_reasons = anti_spoof.reasons if anti_spoof else []

            if is_spoof:
                status = "spoof"
                name = "Spoof Attack"
            elif f.person_id is not None:
                status = "match"
                name = self.gallery.name_of(f.person_id)
                if mark:
                    ev = self.attendance.mark(f.person_id, camera_id, f.score, frame=image, bbox=f.bbox,
                                              person_name=name)
                    marked = ev.kind if ev else None
            else:
                status = "unknown"
                name = "Unknown"

            out.append({
                "bbox": [round(v, 1) for v in f.bbox],
                "person_id": f.person_id,
                "name": name,
                "score": round(f.score, 3),
                "status": status,
                "marked": marked,
                "is_live": not is_spoof,
                "spoof_score": anti_spoof.score if anti_spoof else 0.0,
                "spoof_reasons": spoof_reasons,
            })
        return out
