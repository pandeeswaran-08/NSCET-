"""MediaPipe BlazeFace detector (lightweight mode)."""
from __future__ import annotations

import threading

import cv2
import numpy as np

from app.core.types import Detection


class MediaPipeDetector:
    def __init__(self, conf: float = 0.5) -> None:
        import mediapipe as mp

        self._det = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=conf)
        self._lock = threading.Lock()

    def detect_batch(self, frames: list[np.ndarray]) -> list[list[Detection]]:
        out: list[list[Detection]] = []
        for f in frames:
            h, w = f.shape[:2]
            with self._lock:
                res = self._det.process(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
            dets: list[Detection] = []
            for d in res.detections or []:
                bb = d.location_data.relative_bounding_box
                x1, y1 = max(0.0, bb.xmin * w), max(0.0, bb.ymin * h)
                x2, y2 = min(float(w), (bb.xmin + bb.width) * w), min(float(h), (bb.ymin + bb.height) * h)
                if x2 > x1 and y2 > y1:
                    dets.append(Detection(np.array([x1, y1, x2, y2], np.float32), float(d.score[0])))
            out.append(dets)
        return out
