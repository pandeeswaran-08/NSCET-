"""Draw recognition results on frames."""
from __future__ import annotations

import cv2
import numpy as np

COLORS = {
    "match": (60, 200, 60),
    "recognized": (60, 200, 60),
    "verifying": (0, 200, 255),
    "unknown": (60, 60, 230),
    "spoof": (200, 60, 200),
}


def draw_faces(frame: np.ndarray, faces: list[dict]) -> np.ndarray:
    out = frame.copy()
    for f in faces:
        x1, y1, x2, y2 = [int(v) for v in f["bbox"]]
        color = COLORS.get(f["status"], (200, 200, 200))
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        label = f"{f['name']} {f['score']:.2f}" if f["status"] in ("match", "recognized") else f["name"]
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(out, (x1, max(0, y1 - th - 8)), (x1 + tw + 6, y1), color, -1)
        cv2.putText(out, label, (x1 + 3, max(th, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    return out
