"""MTCNN fallback detector (facenet-pytorch)."""
from __future__ import annotations

import cv2
import numpy as np

from app.core.types import Detection


class MTCNNDetector:
    def __init__(self, conf: float = 0.9, device: str = "cpu") -> None:
        from facenet_pytorch import MTCNN

        self.mtcnn = MTCNN(keep_all=True, device=device, thresholds=[0.6, 0.7, max(0.7, conf)])

    def detect_batch(self, frames: list[np.ndarray]) -> list[list[Detection]]:
        out: list[list[Detection]] = []
        for f in frames:
            boxes, probs, pts = self.mtcnn.detect(cv2.cvtColor(f, cv2.COLOR_BGR2RGB), landmarks=True)
            dets: list[Detection] = []
            if boxes is not None:
                for b, p, k in zip(boxes, probs, pts):
                    dets.append(Detection(np.asarray(b, np.float32), float(p), np.asarray(k, np.float32)))
            out.append(dets)
        return out
