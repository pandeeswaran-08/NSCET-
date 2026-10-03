"""Detect -> landmarks -> align -> embed -> match, batched across frames with adaptive thresholding."""
from __future__ import annotations

import cv2
import numpy as np

from app.core.interfaces import Aligner, Detector, Embedder, Landmarker
from app.core.types import FaceObs
from app.liveness.anti_spoof import check_passive_liveness
from app.recognition.gallery import Gallery
from app.recognition.quality import estimate_pose
from app.utils.image import enhance_low_light


class RecognitionEngine:
    def __init__(self, detector: Detector, landmarker: Landmarker | None, aligner: Aligner,
                 embedder: Embedder, gallery: Gallery, threshold: float = 0.45,
                 low_light_threshold: float = 70.0, need_ear: bool = False,
                 anti_spoof_enabled: bool = False, spoof_threshold: float = 0.55) -> None:
        self.detector, self.landmarker, self.aligner = detector, landmarker, aligner
        self.embedder, self.gallery = embedder, gallery
        self.threshold, self.low_light = threshold, low_light_threshold
        self.need_ear = need_ear
        self.anti_spoof_enabled = anti_spoof_enabled
        self.spoof_threshold = spoof_threshold

    def analyze_frames(self, frames: list[np.ndarray], match: bool = True) -> list[list[FaceObs]]:
        all_dets = self.detector.detect_batch(frames)
        result: list[list[FaceObs]] = [[] for _ in frames]
        flat: list[FaceObs] = []
        aligned: list[np.ndarray] = []
        for i, (frame, dets) in enumerate(zip(frames, all_dets)):
            for d in dets:
                kps, ear = d.kps, None
                if self.landmarker is not None and (self.need_ear or kps is None):
                    lm = self.landmarker.process(frame, d.bbox)
                    if lm is not None:
                        kps, ear = lm.kps, lm.ear
                obs = FaceObs(bbox=tuple(float(v) for v in d.bbox), det_score=d.score, kps=kps, ear=ear)
                crop = self.aligner.align(frame, d.bbox, kps)
                if self.low_light > 0:
                    crop = enhance_low_light(crop, self.low_light)
                aligned.append(crop)

                # Compute pose & lighting-adaptive thresholding
                yaw, roll = (0.0, 0.0)
                if kps is not None:
                    yaw, roll = estimate_pose(kps)

                gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                lum = float(np.mean(gray_crop))
                adaptive_thresh = self.threshold
                if lum < 60.0 or lum > 220.0:
                    adaptive_thresh += 0.05
                if abs(yaw) > 0.22:
                    adaptive_thresh += 0.05

                obs.extra["yaw"] = yaw
                obs.extra["roll"] = roll
                obs.extra["adaptive_threshold"] = adaptive_thresh

                # Passive presentation attack detection
                if self.anti_spoof_enabled:
                    as_res = check_passive_liveness(crop, threshold=self.spoof_threshold)
                    obs.extra["anti_spoof"] = as_res
                    if not as_res.is_live:
                        obs.extra["is_spoof"] = True

                result[i].append(obs)
                flat.append(obs)
        if flat:
            emb = self.embedder.embed(aligned)
            for o, e in zip(flat, emb):
                o.embedding = e
            if match:
                self.gallery.refresh_if_stale()
                scores, labels = self.gallery.search(emb)
                for o, s, l in zip(flat, scores, labels):
                    o.score = float(s)
                    target_thresh = o.extra.get("adaptive_threshold", self.threshold)
                    if o.extra.get("is_spoof"):
                        o.person_id = None
                    else:
                        o.person_id = int(l) if (l >= 0 and s >= target_thresh) else None
        return result
