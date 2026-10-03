"""Registration quality gates: size, blur, pose."""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from app.utils.image import expand_box


@dataclass
class QualityReport:
    ok: bool
    reasons: list[str] = field(default_factory=list)
    blur: float = 0.0
    face_px: int = 0
    yaw: float | None = None
    roll_deg: float | None = None


def estimate_pose(kps: np.ndarray) -> tuple[float, float]:
    """yaw in [-1, 1] (0 = frontal), roll in degrees from 5 keypoints."""
    le, re, nose = kps[0], kps[1], kps[2]
    d1, d2 = nose[0] - le[0], re[0] - nose[0]
    yaw = float((d1 - d2) / max(d1 + d2, 1e-6))
    roll = float(np.degrees(np.arctan2(re[1] - le[1], re[0] - le[0])))
    return yaw, roll


def blur_score(image: np.ndarray, bbox) -> float:
    x1, y1, x2, y2 = expand_box(bbox, 0.0, image.shape)
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(cv2.resize(crop, (160, 160)), cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def check_face_quality(image: np.ndarray, bbox, kps: np.ndarray | None, *, min_face_px: int,
                       blur_threshold: float, max_yaw: float, max_roll_deg: float) -> QualityReport:
    x1, y1, x2, y2 = [float(v) for v in bbox]
    face_px = int(min(x2 - x1, y2 - y1))
    rep = QualityReport(ok=True, face_px=face_px)
    if face_px < min_face_px:
        rep.reasons.append(f"face too small ({face_px}px < {min_face_px}px)")
    rep.blur = blur_score(image, bbox)
    if rep.blur < blur_threshold:
        rep.reasons.append(f"image too blurry (score {rep.blur:.0f} < {blur_threshold:.0f})")
    if kps is not None:
        rep.yaw, rep.roll_deg = estimate_pose(kps)
        if abs(rep.yaw) > max_yaw:
            rep.reasons.append("head turned too far left/right")
        if abs(rep.roll_deg) > max_roll_deg:
            rep.reasons.append("head tilted too much")
    rep.ok = not rep.reasons
    return rep
