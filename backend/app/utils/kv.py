"""Key-value store: Redis with an in-memory fallback."""
from __future__ import annotations

import threading
import time

from loguru import logger


class MemoryKV:
    def __init__(self) -> None:
        self._d: dict[str, tuple[bytes, float | None]] = {}
        self._lock = threading.Lock()

    def _alive(self, key: str) -> bytes | None:
        item = self._d.get(key)
        if item is None:
            return None
        value, exp = item
        if exp is not None and exp < time.monotonic():
            self._d.pop(key, None)
            return None
        return value

    def get(self, key: str) -> bytes | None:
        with self._lock:
            return self._alive(key)

    def set(self, key: str, value: bytes, ttl: int | None = None) -> None:
        with self._lock:
            self._d[key] = (value, time.monotonic() + ttl if ttl else None)

    def set_nx(self, key: str, ttl: int) -> bool:
        with self._lock:
            if self._alive(key) is not None:
                return False
            self._d[key] = (b"1", time.monotonic() + ttl)
            return True

    def delete(self, key: str) -> None:
        with self._lock:
            self._d.pop(key, None)

    def ping(self) -> bool:
        return True


class RedisKV:
    def __init__(self, url: str) -> None:
        import redis

        self._r = redis.Redis.from_url(url, socket_timeout=3, socket_connect_timeout=3)
        self._r.ping()

    def get(self, key: str) -> bytes | None:
        return self._r.get(key)

    def set(self, key: str, value: bytes, ttl: int | None = None) -> None:
        self._r.set(key, value, ex=ttl)

    def set_nx(self, key: str, ttl: int) -> bool:
        return bool(self._r.set(key, b"1", nx=True, ex=ttl))

    def delete(self, key: str) -> None:
        self._r.delete(key)

    def ping(self) -> bool:
        try:
            return bool(self._r.ping())
        except Exception:
            return False


def build_kv(url: str | None):
    if not url:
        logger.warning("REDIS_URL not set -> using in-memory KV (single process only)")
        return MemoryKV()
    try:
        kv = RedisKV(url)
        logger.info("Connected to Redis")
        return kv
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Redis unavailable ({exc}); falling back to in-memory KV")
        return MemoryKV()
