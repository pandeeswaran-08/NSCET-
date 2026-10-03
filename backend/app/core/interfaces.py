"""Interfaces so every model/backend can be swapped."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np

from app.core.types import Detection, LandmarkResult


class Detector(Protocol):
    def detect_batch(self, frames: list[np.ndarray]) -> list[list[Detection]]: ...


class Landmarker(Protocol):
    def process(self, frame: np.ndarray, bbox: np.ndarray) -> LandmarkResult | None: ...


class Aligner(Protocol):
    def align(self, frame: np.ndarray, bbox: np.ndarray, kps: np.ndarray | None) -> np.ndarray: ...


class Embedder(Protocol):
    def embed(self, aligned: list[np.ndarray]) -> np.ndarray: ...


class Matcher(Protocol):
    def build(self, matrix: np.ndarray, labels: np.ndarray) -> None: ...
    def search(self, queries: np.ndarray) -> tuple[np.ndarray, np.ndarray]: ...


@runtime_checkable
class KeyValueStore(Protocol):
    def get(self, key: str) -> bytes | None: ...
    def set(self, key: str, value: bytes, ttl: int | None = None) -> None: ...
    def set_nx(self, key: str, ttl: int) -> bool: ...
    def delete(self, key: str) -> None: ...
    def ping(self) -> bool: ...
