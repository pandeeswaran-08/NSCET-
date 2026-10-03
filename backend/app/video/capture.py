"""Threaded frame grabber with auto-reconnect (RTSP / webcam / file)."""
from __future__ import annotations

import threading
import time

import cv2
import numpy as np
from loguru import logger


class FrameGrabber:
    def __init__(self, source: str, name: str = "cam", loop_files: bool = True, max_backoff: float = 30.0) -> None:
        self.source: int | str = int(source) if str(source).isdigit() else source
        self.name, self.loop_files, self.max_backoff = name, loop_files, max_backoff
        self._frame: np.ndarray | None = None
        self._id = 0
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"grabber-{name}", daemon=True)
        self.connected = False
        self._is_file = isinstance(self.source, str) and not self.source.lower().startswith(("rtsp", "http", "rtmp"))

    def start(self) -> "FrameGrabber":
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=3)

    def read(self) -> tuple[np.ndarray | None, int]:
        with self._lock:
            return (None if self._frame is None else self._frame), self._id

    def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            cap = cv2.VideoCapture(self.source)
            if not cap.isOpened():
                self.connected = False
                logger.warning(f"[{self.name}] cannot open source; retry in {backoff:.0f}s")
                self._stop.wait(backoff)
                backoff = min(backoff * 2, self.max_backoff)
                continue
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            self.connected, backoff = True, 1.0
            logger.info(f"[{self.name}] connected")
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    break
                with self._lock:
                    self._frame, self._id = frame, self._id + 1
                if self._is_file:
                    time.sleep(1.0 / fps)
            cap.release()
            self.connected = False
            if self._is_file and not self.loop_files:
                return
            logger.warning(f"[{self.name}] stream lost; reconnecting")
            self._stop.wait(1.0)
