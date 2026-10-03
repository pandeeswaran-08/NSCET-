from __future__ import annotations

from app.core.config import Settings
from app.core.interfaces import Detector


def resolve_device(device: str) -> str:
    if device != "auto":
        return device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        return "cpu"


def build_detector(s: Settings) -> Detector:
    device = resolve_device(s.device)
    if s.detector == "yolo":
        from app.detection.yolo_detector import YoloFaceDetector

        return YoloFaceDetector(s.yolo_weights, s.detector_conf, s.detector_imgsz, device)
    if s.detector == "mtcnn":
        from app.detection.mtcnn_detector import MTCNNDetector

        return MTCNNDetector(max(s.detector_conf, 0.9), device)
    from app.detection.mediapipe_detector import MediaPipeDetector

    return MediaPipeDetector(s.detector_conf)
