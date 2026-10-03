"""FaceMesh landmarks -> 5 keypoints, EAR."""
from __future__ import annotations

import threading

import cv2
import numpy as np

from app.core.types import LandmarkResult
from app.utils.image import expand_box

# MediaPipe FaceMesh indices
_R_EYE = [33, 160, 158, 133, 153, 144]   # subject's right eye (viewer's left)
_L_EYE = [362, 385, 387, 263, 373, 380]  # subject's left eye (viewer's right)


def five_points(pts: np.ndarray) -> np.ndarray:
    """pts: (468+, 2) -> (5, 2): eye(viewer-left), eye(viewer-right), nose, mouth-left, mouth-right."""
    return np.array([
        (pts[33] + pts[133]) / 2,
        (pts[362] + pts[263]) / 2,
        pts[1],
        pts[61],
        pts[291],
    ], dtype=np.float32)


def eye_aspect_ratio(pts: np.ndarray, idx: list[int]) -> float:
    p = pts[idx]
    v = np.linalg.norm(p[1] - p[5]) + np.linalg.norm(p[2] - p[4])
    h = np.linalg.norm(p[0] - p[3]) + 1e-6
    return float(v / (2.0 * h))


def mean_ear(pts: np.ndarray) -> float:
    return (eye_aspect_ratio(pts, _R_EYE) + eye_aspect_ratio(pts, _L_EYE)) / 2.0


class FaceMeshLandmarker:
    def __init__(self, margin: float = 0.25) -> None:
        import mediapipe as mp

        self._mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.3)
        self._lock = threading.Lock()
        self.margin = margin

    def process(self, frame: np.ndarray, bbox: np.ndarray) -> LandmarkResult | None:
        x1, y1, x2, y2 = expand_box(bbox, self.margin, frame.shape)
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        with self._lock:
            res = self._mesh.process(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
        if not res.multi_face_landmarks:
            return None
        ch, cw = crop.shape[:2]
        lm = res.multi_face_landmarks[0].landmark
        pts = np.array([(p.x * cw + x1, p.y * ch + y1) for p in lm], dtype=np.float32)
        return LandmarkResult(kps=five_points(pts), ear=mean_ear(pts))
