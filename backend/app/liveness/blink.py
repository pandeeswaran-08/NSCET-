"""Multi-frame liveness verification: blink dynamics and micro-motion."""
from __future__ import annotations

from app.liveness.active_liveness import CompositeLiveness


class BlinkLiveness:
    def __init__(self, ear_threshold: float = 0.21) -> None:
        self.thr = ear_threshold
        self._composite = CompositeLiveness(ear_threshold=ear_threshold)

    def update(
        self,
        track,
        ear: float | None,
        yaw: float | None = None,
        pitch: float | None = None,
    ) -> None:
        self._composite.update(track, ear, yaw, pitch)

    def is_live(self, track) -> bool:
        return self._composite.is_live(track)

    def evaluate(self, track):
        return self._composite.evaluate(track)

