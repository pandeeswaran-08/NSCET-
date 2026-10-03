"""Multi-frame active and behavioral liveness: blink dynamics + micro-pose motion."""
from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np


@dataclass(slots=True)
class LivenessStatus:
    is_live: bool
    blinks: int = 0
    motion_score: float = 0.0
    status_label: str = "Verifying liveness..."
    reasons: list[str] = field(default_factory=list)


class CompositeLiveness:
    """
    Combines eye-aspect-ratio (EAR) blink detection with natural 3D head micro-motion.
    Prevents both static 2D photo attacks (zero motion, zero blinks) and
    stuck closed-eye/cutout photo attacks.
    """

    def __init__(
        self,
        ear_threshold: float = 0.21,
        min_blinks: int = 1,
        motion_threshold: float = 0.003,
    ) -> None:
        self.ear_threshold = ear_threshold
        self.min_blinks = min_blinks
        self.motion_threshold = motion_threshold

    def update(
        self,
        track,
        ear: float | None,
        yaw: float | None = None,
        pitch: float | None = None,
    ) -> None:
        # 1. Update eye aspect ratio & blink state
        if not hasattr(track, "ears"):
            track.ears = []
        if not hasattr(track, "yaws"):
            track.yaws = []
        if not hasattr(track, "pitches"):
            track.pitches = []

        if ear is not None:
            track.ears.append(float(ear))
            if len(track.ears) > 30:
                track.ears.pop(0)

            if ear < self.ear_threshold:
                if getattr(track, "seen_open", False):
                    track.closed_frames = getattr(track, "closed_frames", 0) + 1
            else:
                closed = getattr(track, "closed_frames", 0)
                # Valid blink duration: 1 to 6 frames (approx 60ms to 350ms)
                if 1 <= closed <= 6:
                    track.blinks = getattr(track, "blinks", 0) + 1
                track.closed_frames = 0
                track.seen_open = True

        # 2. Update head pose trajectory for micro-motion
        if yaw is not None:
            track.yaws.append(float(yaw))
            if len(track.yaws) > 30:
                track.yaws.pop(0)

        if pitch is not None:
            track.pitches.append(float(pitch))
            if len(track.pitches) > 30:
                track.pitches.pop(0)

    def evaluate(self, track) -> LivenessStatus:
        blinks = getattr(track, "blinks", 0)
        yaws = getattr(track, "yaws", [])
        pitches = getattr(track, "pitches", [])

        # Calculate micro-motion variance over recent frames
        motion_var = 0.0
        if len(yaws) >= 5:
            yaw_std = float(np.std(yaws))
            pitch_std = float(np.std(pitches)) if len(pitches) >= 5 else 0.0
            motion_var = yaw_std + pitch_std

        # Condition 1: Verified eye blink
        has_blinked = blinks >= self.min_blinks

        # Condition 2: Verified natural human micro-motion across > 8 frames
        has_natural_motion = (len(yaws) >= 8 and motion_var >= self.motion_threshold)

        reasons = []
        if not has_blinked and not has_natural_motion:
            if getattr(track, "closed_frames", 0) > 8:
                reasons.append("eyes remain closed or static cutout detected")
            else:
                reasons.append("blink or subtle head movement required")

        is_live = has_blinked or has_natural_motion
        label = "Live Face Confirmed" if is_live else (
            "Please blink naturally" if not has_blinked else "Verifying presence..."
        )

        return LivenessStatus(
            is_live=is_live,
            blinks=blinks,
            motion_score=round(motion_var, 4),
            status_label=label,
            reasons=reasons,
        )

    def is_live(self, track) -> bool:
        return self.evaluate(track).is_live
