"""Builds the real (heavy) recognition engine."""
from __future__ import annotations

from loguru import logger

from app.alignment.aligner import ArcFaceAligner
from app.core.config import Settings
from app.detection.factory import build_detector, resolve_device
from app.recognition.embedder import InsightFaceEmbedder
from app.recognition.engine import RecognitionEngine
from app.recognition.gallery import Gallery


def build_engine(s: Settings, gallery: Gallery) -> RecognitionEngine:
    device = resolve_device(s.device)
    logger.info(f"Loading models (detector={s.detector}, device={device})")
    detector = build_detector(s)
    landmarker = None
    if s.use_landmarks or s.liveness_enabled:
        from app.alignment.landmarks import FaceMeshLandmarker

        landmarker = FaceMeshLandmarker()
    embedder = InsightFaceEmbedder(s.insightface_model, f"{s.models_dir}/insightface", device)
    return RecognitionEngine(detector, landmarker, ArcFaceAligner(), embedder, gallery,
                             threshold=s.match_threshold, low_light_threshold=s.low_light_threshold,
                             need_ear=s.liveness_enabled,
                             anti_spoof_enabled=s.anti_spoof_enabled or s.liveness_enabled,
                             spoof_threshold=s.spoof_threshold)
