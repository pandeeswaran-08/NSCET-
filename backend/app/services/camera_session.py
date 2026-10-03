"""Per-camera state: tracker + liveness + attendance trigger."""
from __future__ import annotations

import numpy as np

from app.core.config import CameraConfig, Settings
from app.core.types import AttendanceEvent, FaceObs
from app.liveness.blink import BlinkLiveness
from app.recognition.gallery import Gallery
from app.services.attendance_service import AttendanceService
from app.tracking.tracker import IoUTracker


class CameraSession:
    def __init__(self, camera: CameraConfig, settings: Settings, attendance: AttendanceService,
                 gallery: Gallery) -> None:
        self.camera, self.s, self.attendance, self.gallery = camera, settings, attendance, gallery
        self.tracker = IoUTracker(settings.track_iou, settings.track_max_age, settings.confirm_frames)
        self.liveness = BlinkLiveness(settings.ear_threshold)

    def update(self, frame: np.ndarray, observations: list[FaceObs]) -> tuple[list[dict], list[AttendanceEvent]]:
        faces: list[dict] = []
        events: list[AttendanceEvent] = []
        for track, obs in self.tracker.update(observations):
            yaw = obs.extra.get("yaw")
            is_spoof = obs.extra.get("is_spoof", False)

            if self.s.liveness_enabled:
                self.liveness.update(track, obs.ear, yaw=yaw)

            active_live = self.liveness.is_live(track) if self.s.liveness_enabled else True
            live = active_live and not is_spoof

            status, name = "unknown", "Unknown"
            if is_spoof:
                status, name = "spoof", "Spoof Attack"
            elif track.confirmed_pid is not None:
                pid = track.confirmed_pid
                name = self.gallery.name_of(pid)
                if not live:
                    status, name = "verifying", f"{name} - blink to verify"
                else:
                    status = "match"
                    if not track.marked:
                        track.marked = True
                        ev = self.attendance.mark(pid, self.camera.id, track.best_score, frame=frame,
                                                  bbox=obs.bbox, mode=self.camera.mode, person_name=name)
                        if ev:
                            events.append(ev)
            elif track.cand_pid is not None:
                status, name = "verifying", "Verifying..."
            faces.append({"track_id": track.id, "bbox": [round(v, 1) for v in obs.bbox], "name": name,
                          "person_id": track.confirmed_pid, "score": round(float(obs.score), 3),
                          "status": status, "live": live})
        return faces, events
