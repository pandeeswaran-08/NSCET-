"""InsightFace ArcFace (buffalo_l, 512-D) via ONNX Runtime."""
from __future__ import annotations

import numpy as np

from app.utils.image import l2_normalize


class InsightFaceEmbedder:
    def __init__(self, model_name: str = "buffalo_l", root: str = "models/insightface",
                 device: str = "cpu") -> None:
        from insightface.app import FaceAnalysis

        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if device == "cuda" else ["CPUExecutionProvider"]
        fa = FaceAnalysis(name=model_name, root=root, allowed_modules=["detection", "recognition"], providers=providers)
        self._rec = fa.models["recognition"]

    def embed(self, aligned: list[np.ndarray]) -> np.ndarray:
        if not aligned:
            return np.empty((0, 512), np.float32)
        feats = np.asarray(self._rec.get_feat(aligned), dtype=np.float32).reshape(len(aligned), -1)
        return l2_normalize(feats)
