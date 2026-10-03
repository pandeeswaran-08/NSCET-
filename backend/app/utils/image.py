"""Image helpers."""
from __future__ import annotations

import cv2
import numpy as np


def decode_image(data: bytes, max_side: int = 1920) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image")
    h, w = img.shape[:2]
    scale = max_side / max(h, w)
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def encode_jpeg(img: np.ndarray, quality: int = 70) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise ValueError("JPEG encode failed")
    return buf.tobytes()


def enhance_low_light(frame: np.ndarray, threshold: float = 70.0) -> np.ndarray:
    """CLAHE on the L channel when the frame is dark."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if float(gray.mean()) >= threshold:
        return frame
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def expand_box(bbox, margin: float, shape: tuple[int, ...]) -> tuple[int, int, int, int]:
    h, w = shape[:2]
    x1, y1, x2, y2 = [float(v) for v in bbox]
    bw, bh = x2 - x1, y2 - y1
    x1 = max(0, int(x1 - bw * margin))
    y1 = max(0, int(y1 - bh * margin))
    x2 = min(w, int(x2 + bw * margin))
    y2 = min(h, int(y2 + bh * margin))
    return x1, y1, x2, y2


def l2_normalize(x: np.ndarray, axis: int = -1) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    n = np.linalg.norm(x, axis=axis, keepdims=True)
    return x / np.clip(n, 1e-12, None)
