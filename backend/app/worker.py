"""Multi-threaded Camera Worker: runs each camera in an independent bounded pipeline thread."""
from __future__ import annotations

import json
import signal
import threading
import time

from loguru import logger

from app.core.config import CameraConfig, Settings, get_settings
from app.core.logging import setup_logging
from app.recognition.engine import RecognitionEngine
from app.services.camera_session import CameraSession
from app.services.container import Container
from app.utils.image import encode_jpeg
from app.utils.viz import draw_faces
from app.video.capture import FrameGrabber


class CameraPipelineWorker(threading.Thread):
    """Dedicated worker thread for an individual camera stream with bounded queue and zero lag."""

    def __init__(
        self,
        camera: CameraConfig,
        settings: Settings,
        container: Container,
        engine: RecognitionEngine,
        stop_event: threading.Event,
    ) -> None:
        super().__init__(name=f"camera-worker-{camera.id}", daemon=True)
        self.camera = camera
        self.s = settings
        self.c = container
        self.engine = engine
        self.stop = stop_event

        self.grabber = FrameGrabber(camera.source, camera.id).start()
        self.session = CameraSession(camera, settings, container.attendance, container.gallery)
        self.last_id = -1
        self.last_faces: list[dict] = []
        self.recent_events: list[dict] = []
        self.frame_counter = 0
        self.skip = max(1, settings.frame_skip)

        self.fps = 0.0
        self.fps_n = 0
        self.fps_t = time.time()
        self.last_pub_t = 0.0

    def run(self) -> None:
        logger.info(f"[{self.camera.id}] Pipeline worker started (skip={self.skip})")
        while not self.stop.is_set():
            frame, fid = self.grabber.read()
            if frame is None or fid == self.last_id:
                time.sleep(0.005)
                continue

            self.last_id = fid
            self.frame_counter += 1

            # Adaptive recognition frame skipping
            if self.frame_counter % self.skip == 0:
                try:
                    analyses = self.engine.analyze_frames([frame], match=True)
                    if analyses:
                        faces, events = self.session.update(frame, analyses[0])
                        self.last_faces = faces
                        for ev in events:
                            self.recent_events = (
                                self.recent_events
                                + [
                                    {
                                        "person_id": ev.person_id,
                                        "name": ev.person_name,
                                        "kind": ev.kind,
                                        "time": ev.timestamp.isoformat(),
                                        "confidence": round(ev.confidence, 3),
                                    }
                                ]
                            )[-10:]
                except Exception as exc:  # noqa: BLE001
                    logger.exception(f"[{self.camera.id}] Inference error: {exc}")
                    time.sleep(0.1)

            # Telemetry FPS calculation
            self.fps_n += 1
            now = time.time()
            if now - self.fps_t >= 2.0:
                self.fps = self.fps_n / (now - self.fps_t)
                self.fps_n = 0
                self.fps_t = now

            # Throttled publish to KV cache (~10 FPS max to avoid saturation)
            if now - self.last_pub_t >= 0.09:
                self.last_pub_t = now
                try:
                    annotated = draw_faces(frame, self.last_faces)
                    jpeg_bytes = encode_jpeg(annotated, self.s.jpeg_quality)
                    self.c.kv.set(f"frame:{self.camera.id}", jpeg_bytes, ttl=10)
                    self.c.kv.set(
                        f"result:{self.camera.id}",
                        json.dumps(
                            {
                                "camera_id": self.camera.id,
                                "ts": now,
                                "connected": self.grabber.connected,
                                "fps": round(self.fps, 1),
                                "faces": self.last_faces,
                                "events": self.recent_events,
                            }
                        ).encode(),
                        ttl=10,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning(f"[{self.camera.id}] Publish error: {exc}")

        logger.info(f"[{self.camera.id}] Pipeline worker stopped")
        self.grabber.stop()


def main() -> None:
    s = get_settings()
    setup_logging(s.log_level, s.log_json)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())

    c = Container(s)
    cams = [cam for cam in s.cameras if cam.enabled]
    if not cams:
        logger.error("No enabled cameras in config.yaml")
        return

    engine = c.get_engine()
    c.gallery.refresh_if_stale()

    # Launch parallel worker thread per camera
    workers = [
        CameraPipelineWorker(cam, s, c, engine, stop)
        for cam in cams
    ]
    for w in workers:
        w.start()

    logger.info(f"Multi-camera worker running: {[cam.id for cam in cams]}")
    last_purge = 0.0

    while not stop.is_set():
        stop.wait(1.0)
        # Daily retention purge
        if time.time() - last_purge > 86400:
            last_purge = time.time()
            try:
                n = c.repo.purge_older_than(s.retention_days)
                if n:
                    logger.info(f"Retention purge removed {n} attendance rows")
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"Retention purge failed: {exc}")

    logger.info("Stopping all camera workers...")
    for w in workers:
        w.join(timeout=3.0)
    logger.info("Shutdown complete")


if __name__ == "__main__":
    main()
