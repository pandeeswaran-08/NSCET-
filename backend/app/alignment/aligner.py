"""ArcFace 112x112 alignment."""
from __future__ import annotations

import cv2
import numpy as np

from app.utils.image import expand_box

ARCFACE_TEMPLATE = np.array([
    [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
    [41.5493, 92.3655], [70.7299, 92.2041],
], dtype=np.float32)


class ArcFaceAligner:
    size = 112

    def align(self, frame: np.ndarray, bbox: np.ndarray, kps: np.ndarray | None) -> np.ndarray:
        if kps is not None:
            m, _ = cv2.estimateAffinePartial2D(np.asarray(kps, np.float32), ARCFACE_TEMPLATE, method=cv2.LMEDS)
            if m is not None:
                return cv2.warpAffine(frame, m, (self.size, self.size), borderValue=0)
        x1, y1, x2, y2 = expand_box(bbox, 0.1, frame.shape)
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return np.zeros((self.size, self.size, 3), np.uint8)
        return cv2.resize(crop, (self.size, self.size), interpolation=cv2.INTER_LINEAR)
