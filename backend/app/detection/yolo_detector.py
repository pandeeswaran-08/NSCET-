"""YOLO11 face detector (primary). Accepts .pt or exported .onnx weights."""
from __future__ import annotations

import numpy as np

from app.core.types import Detection


class YoloFaceDetector:
    def __init__(self, weights: str, conf: float = 0.5, imgsz: int = 640, device: str = "cpu") -> None:
        from ultralytics import YOLO

        self.model = YOLO(weights)
        self.conf, self.imgsz, self.device = conf, imgsz, device

    def detect_batch(self, frames: list[np.ndarray]) -> list[list[Detection]]:
        if not frames:
            return []
        results = self.model.predict(frames, conf=self.conf, imgsz=self.imgsz,
                                     iou=0.45, device=self.device, verbose=False)
        out: list[list[Detection]] = []
        for r in results:
            dets: list[Detection] = []
            if r.boxes is None or len(r.boxes) == 0:
                out.append(dets)
                continue
            boxes = r.boxes.xyxy.cpu().numpy()
            scores = r.boxes.conf.cpu().numpy()
            kps = None
            if getattr(r, "keypoints", None) is not None and r.keypoints.xy is not None:
                k = r.keypoints.xy.cpu().numpy()
                if k.ndim == 3 and k.shape[1] == 5:
                    kps = k
            for i, (b, s) in enumerate(zip(boxes, scores)):
                dets.append(Detection(bbox=b.astype(np.float32), score=float(s),
                                      kps=kps[i].astype(np.float32) if kps is not None else None))
            out.append(dets)
        return out
