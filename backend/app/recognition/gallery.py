"""Embedding gallery cached in Redis; every process reloads when the version key changes."""
from __future__ import annotations

import io
import threading
import uuid

import numpy as np
from loguru import logger

from app.core.interfaces import KeyValueStore, Matcher
from app.db.repository import Repository

_DATA_KEY, _VER_KEY = "gallery:data", "gallery:version"


class Gallery:
    def __init__(self, repo: Repository, kv: KeyValueStore, matcher: Matcher) -> None:
        self._repo, self._kv, self.matcher = repo, kv, matcher
        self._version: bytes | None = None
        self._names: dict[int, str] = {}
        self._size = 0
        self._lock = threading.RLock()

    # ---- build / load ----
    def rebuild(self) -> None:
        rows = self._repo.gallery_rows()
        vecs, labels = [], []
        for r in rows:
            for v in [r.mean, *r.embeddings]:
                vecs.append(v)
                labels.append(r.person_id)
        matrix = np.stack(vecs).astype(np.float32) if vecs else np.empty((0, 512), np.float32)
        pids = np.array([r.person_id for r in rows], np.int64)
        pnames = np.array([r.name for r in rows], dtype="U128")
        buf = io.BytesIO()
        np.savez_compressed(buf, matrix=matrix, labels=np.array(labels, np.int64), pids=pids, pnames=pnames)
        version = uuid.uuid4().hex.encode()
        try:
            self._kv.set(_DATA_KEY, buf.getvalue())
            self._kv.set(_VER_KEY, version)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Could not cache gallery: {exc}")
        with self._lock:
            self._apply(matrix, np.array(labels, np.int64), pids, pnames)
            self._version = version
        logger.info(f"Gallery rebuilt: {len(rows)} persons / {matrix.shape[0]} vectors")

    def _apply(self, matrix, labels, pids, pnames) -> None:
        self.matcher.build(matrix, labels)
        self._names = {int(p): str(n) for p, n in zip(pids, pnames)}
        self._size = len(self._names)

    def refresh_if_stale(self) -> None:
        try:
            ver = self._kv.get(_VER_KEY)
            if ver is not None and ver == self._version:
                return
            data = self._kv.get(_DATA_KEY) if ver is not None else None
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Gallery cache read failed: {exc}")
            ver, data = None, None
        if ver is None or data is None:
            if self._version is None or ver is None:
                self.rebuild()
            return
        with np.load(io.BytesIO(data)) as z:
            with self._lock:
                self._apply(z["matrix"], z["labels"], z["pids"], z["pnames"])
                self._version = ver

    # ---- query ----
    def search(self, queries: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        with self._lock:
            return self.matcher.search(queries)

    def name_of(self, person_id: int | None) -> str:
        return self._names.get(person_id, "Unknown") if person_id is not None else "Unknown"

    @property
    def size(self) -> int:
        return self._size
