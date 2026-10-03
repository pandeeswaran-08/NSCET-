from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from app.core.types import Detection
from app.alignment.aligner import ArcFaceAligner
from app.recognition.engine import RecognitionEngine
from app.services.container import Container

API_KEY = "test-key"


class FakeDetector:
    """One face covering most of the frame; keypoints in a frontal layout."""

    def detect_batch(self, frames):
        out = []
        for f in frames:
            h, w = f.shape[:2]
            kps = np.array([[0.35 * w, 0.4 * h], [0.65 * w, 0.4 * h], [0.5 * w, 0.55 * h],
                            [0.38 * w, 0.72 * h], [0.62 * w, 0.72 * h]], np.float32)
            out.append([Detection(np.array([0.1 * w, 0.1 * h, 0.9 * w, 0.9 * h], np.float32), 0.99, kps)])
        return out


class FakeEmbedder:
    """Identity is encoded in pixel (0,0) of the source image -> carried via the first aligned pixel row."""

    def embed(self, aligned):
        out = []
        for a in aligned:
            ident = int(np.asarray(a).reshape(-1, 3)[:, 0].mean()) // 8  # coarse, survives warping
            rng = np.random.default_rng(ident)
            v = rng.normal(size=512)
            v += np.random.default_rng(int(a.sum()) % 997).normal(size=512) * 0.05
            out.append(v / np.linalg.norm(v))
        return np.array(out, np.float32).reshape(len(aligned), 512)


def make_face_image(identity: int, seed: int, size: int = 240) -> np.ndarray:
    """Textured (sharp) image whose blue channel mean encodes the identity."""
    rng = np.random.default_rng(seed)
    img = rng.integers(0, 255, (size, size, 3), dtype=np.uint8)
    img[:, :, 0] = np.clip(identity * 8 + 4 + rng.integers(-2, 3, (size, size)), 0, 255)
    return img


@pytest.fixture()
def settings(tmp_path):
    return Settings(database_url=f"sqlite:///{tmp_path}/t.db", redis_url=None, api_key=API_KEY,
                    snapshots_dir=str(tmp_path / "snaps"), raw_dir=str(tmp_path / "raw"),
                    min_images=5, blur_threshold=10.0, min_face_px=50, cameras=[], low_light_threshold=0)


@pytest.fixture()
def container(settings):
    c = Container(settings)
    engine = RecognitionEngine(FakeDetector(), None, ArcFaceAligner(), FakeEmbedder(), c.gallery,
                               threshold=settings.match_threshold, low_light_threshold=0)
    c._engine = engine
    return c


@pytest.fixture()
def client(container):
    return TestClient(create_app(container), headers={"X-API-Key": API_KEY})
