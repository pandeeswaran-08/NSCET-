"""Shared dataclasses."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass(slots=True)
class Detection:
    bbox: np.ndarray                 # (4,) x1, y1, x2, y2 in pixels
    score: float
    kps: np.ndarray | None = None    # (5, 2) left-eye, right-eye, nose, left-mouth, right-mouth


@dataclass(slots=True)
class LandmarkResult:
    kps: np.ndarray                  # (5, 2)
    ear: float | None = None         # mean eye-aspect-ratio


@dataclass(slots=True)
class FaceObs:
    bbox: tuple[float, float, float, float]
    det_score: float
    kps: np.ndarray | None = None
    ear: float | None = None
    embedding: np.ndarray | None = None
    person_id: int | None = None
    score: float = 0.0
    extra: dict = field(default_factory=dict)


@dataclass(slots=True)
class AttendanceEvent:
    person_id: int
    person_name: str
    kind: str
    timestamp: object
    camera_id: str
    confidence: float
    snapshot_path: str | None = None
