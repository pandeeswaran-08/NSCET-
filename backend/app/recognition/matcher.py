"""Cosine-similarity matchers (vectorized NumPy, FAISS, and Adaptive Hybrid)."""
from __future__ import annotations

import numpy as np


class NumpyMatcher:
    def __init__(self) -> None:
        self._m = np.empty((0, 512), np.float32)
        self._labels = np.empty((0,), np.int64)

    def build(self, matrix: np.ndarray, labels: np.ndarray) -> None:
        self._m = np.ascontiguousarray(matrix, dtype=np.float32)
        self._labels = np.asarray(labels, dtype=np.int64)

    def search(self, queries: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        q = np.atleast_2d(np.asarray(queries, np.float32))
        n = q.shape[0]
        if self._m.shape[0] == 0 or n == 0:
            return np.full(n, -1.0, np.float32), np.full(n, -1, np.int64)
        sims = q @ self._m.T
        idx = sims.argmax(axis=1)
        return sims[np.arange(n), idx], self._labels[idx]


class FaissMatcher:
    def __init__(self) -> None:
        import faiss  # noqa: F401

        self._index = None
        self._labels = np.empty((0,), np.int64)

    def build(self, matrix: np.ndarray, labels: np.ndarray) -> None:
        import faiss

        self._labels = np.asarray(labels, dtype=np.int64)
        if matrix.shape[0] == 0:
            self._index = None
            return
        # IndexFlatIP performs exact cosine search since vectors are L2-normalized
        self._index = faiss.IndexFlatIP(matrix.shape[1])
        self._index.add(np.ascontiguousarray(matrix, dtype=np.float32))

    def search(self, queries: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        q = np.ascontiguousarray(np.atleast_2d(queries), dtype=np.float32)
        n = q.shape[0]
        if self._index is None or n == 0:
            return np.full(n, -1.0, np.float32), np.full(n, -1, np.int64)
        scores, idx = self._index.search(q, 1)
        return scores[:, 0], self._labels[idx[:, 0]]


class AdaptiveMatcher:
    """Intelligently routes vector search: vectorized NumPy for small galleries (<= 5,000 vectors)
    for zero-overhead BLAS dot products, switching to FAISS once gallery exceeds 5,000 vectors."""

    def __init__(self, switch_threshold: int = 5000) -> None:
        self.switch_threshold = switch_threshold
        self.numpy_matcher = NumpyMatcher()
        self.faiss_matcher: FaissMatcher | None = None
        try:
            self.faiss_matcher = FaissMatcher()
        except ImportError:
            self.faiss_matcher = None
        self._count = 0

    def build(self, matrix: np.ndarray, labels: np.ndarray) -> None:
        self._count = matrix.shape[0] if matrix is not None else 0
        self.numpy_matcher.build(matrix, labels)
        if self.faiss_matcher is not None and self._count > self.switch_threshold:
            self.faiss_matcher.build(matrix, labels)

    def search(self, queries: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        if self._count > self.switch_threshold and self.faiss_matcher is not None:
            return self.faiss_matcher.search(queries)
        return self.numpy_matcher.search(queries)


def build_matcher(use_faiss: bool = False):
    if use_faiss:
        try:
            return FaissMatcher()
        except ImportError:
            pass
    return AdaptiveMatcher(switch_threshold=5000)
