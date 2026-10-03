"""Pipeline profiling script: measures ms/frame across each stage of detection, alignment, embedding, and matching."""
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import time
import numpy as np
import cv2
from app.core.config import get_settings
from app.services.container import Container
from app.utils.image import enhance_low_light
from app.recognition.matcher import NumpyMatcher, FaissMatcher


def create_synthetic_frame(num_faces: int = 1, width: int = 1280, height: int = 720) -> np.ndarray:
    """Creates a synthetic frame with simple simulated facial skin-tone ellipses."""
    frame = np.full((height, width, 3), 40, dtype=np.uint8)  # dim background
    for i in range(num_faces):
        cx = int((i + 1) * width / (num_faces + 1))
        cy = height // 2
        # Head ellipse
        cv2.ellipse(frame, (cx, cy), (70, 95), 0, 0, 360, (180, 210, 235), -1)
        # Eyes
        cv2.circle(frame, (cx - 25, cy - 20), 8, (60, 60, 60), -1)
        cv2.circle(frame, (cx + 25, cy - 20), 8, (60, 60, 60), -1)
        # Mouth
        cv2.ellipse(frame, (cx, cy + 35), (20, 8), 0, 0, 180, (80, 80, 160), -1)
    return frame


def profile_pipeline(iterations: int = 5):
    settings = get_settings()
    c = Container(settings)
    engine = c.get_engine()

    print("=" * 70)
    print("BIOMETRIC PIPELINE PROFILING REPORT")
    print(f"Device: {settings.device.upper()} | Detector: {settings.detector} | Embedder: {settings.insightface_model}")
    print("=" * 70)

    # 1. Profile Preprocessing: Full-frame CLAHE vs Face-crop CLAHE
    frame_1080p = np.random.randint(20, 60, (720, 1280, 3), dtype=np.uint8)
    crop_112 = np.random.randint(20, 60, (112, 112, 3), dtype=np.uint8)

    t0 = time.perf_counter()
    for _ in range(iterations):
        _ = enhance_low_light(frame_1080p, threshold=70.0)
    t_full_clahe = ((time.perf_counter() - t0) / iterations) * 1000

    t0 = time.perf_counter()
    for _ in range(iterations):
        _ = enhance_low_light(crop_112, threshold=70.0)
    t_crop_clahe = ((time.perf_counter() - t0) / iterations) * 1000

    print(f"\n[1] PREPROCESSING (CLAHE):")
    print(f"  • Full-frame (1280x720) CLAHE:  {t_full_clahe:.2f} ms")
    print(f"  • Aligned Crop (112x112) CLAHE: {t_crop_clahe:.2f} ms  (Speedup: {t_full_clahe / max(t_crop_clahe, 1e-4):.1f}x)")

    # 2. Profile Detection (YOLO)
    t0 = time.perf_counter()
    for _ in range(iterations):
        _ = engine.detector.detect_batch([frame_1080p])
    t_det = ((time.perf_counter() - t0) / iterations) * 1000
    print(f"\n[2] FACE DETECTION (YOLO11s-face 640x640):")
    print(f"  • Detection Latency:            {t_det:.2f} ms / frame")

    # 3. Profile Embedding (ArcFace buffalo_l 512-D)
    crops_single = [np.random.randint(0, 255, (112, 112, 3), dtype=np.uint8)]
    crops_batch4 = [np.random.randint(0, 255, (112, 112, 3), dtype=np.uint8) for _ in range(4)]

    t0 = time.perf_counter()
    for _ in range(iterations):
        _ = engine.embedder.embed(crops_single)
    t_embed_single = ((time.perf_counter() - t0) / iterations) * 1000

    t0 = time.perf_counter()
    for _ in range(iterations):
        _ = engine.embedder.embed(crops_batch4)
    t_embed_batch4 = ((time.perf_counter() - t0) / iterations) * 1000

    print(f"\n[3] FEATURE EXTRACTION (InsightFace ArcFace 512-D):")
    print(f"  • Single Face Embedding (B=1):  {t_embed_single:.2f} ms")
    print(f"  • 4-Face Batch Embedding (B=4): {t_embed_batch4:.2f} ms ({t_embed_batch4 / 4:.2f} ms / face)")

    # 4. Profile Gallery Matching: NumPy vs FAISS at Various Gallery Sizes
    print(f"\n[4] VECTOR GALLERY MATCHING (512-D Cosine Search):")
    sizes = [100, 1000, 5000, 10000]
    query_1 = np.random.randn(1, 512).astype(np.float32)
    query_1 /= np.linalg.norm(query_1, axis=1, keepdims=True)

    numpy_matcher = NumpyMatcher()
    faiss_matcher = None
    try:
        faiss_matcher = FaissMatcher()
    except Exception:
        faiss_matcher = None

    print(f"  {'Gallery Size':<15} | {'NumPy (ms)':<15} | {'FAISS (ms)':<15} | {'FAISS Speedup':<15}")
    print("  " + "-" * 65)

    for sz in sizes:
        gallery_mat = np.random.randn(sz, 512).astype(np.float32)
        gallery_mat /= np.linalg.norm(gallery_mat, axis=1, keepdims=True)
        labels = np.arange(sz, dtype=np.int64)

        numpy_matcher.build(gallery_mat, labels)
        t0 = time.perf_counter()
        for _ in range(50):
            _ = numpy_matcher.search(query_1)
        t_np = ((time.perf_counter() - t0) / 50) * 1000

        t_faiss_str = "N/A"
        speedup_str = "N/A"
        if faiss_matcher:
            try:
                faiss_matcher.build(gallery_mat, labels)
                t0 = time.perf_counter()
                for _ in range(50):
                    _ = faiss_matcher.search(query_1)
                t_faiss = ((time.perf_counter() - t0) / 50) * 1000
                t_faiss_str = f"{t_faiss:.3f} ms"
                speedup_str = f"{t_np / max(t_faiss, 1e-6):.1f}x"
            except Exception as e:
                t_faiss_str = "Error"

        print(f"  {sz:<15} | {t_np:.3f} ms        | {t_faiss_str:<15} | {speedup_str:<15}")

    # 5. End-to-End Pipeline Summary
    total_single = t_crop_clahe + t_det + t_embed_single + 0.05
    fps_est = 1000.0 / total_single
    print(f"\n[5] END-TO-END LATENCY & THROUGHPUT (Single Face per Frame):")
    print(f"  • Estimated End-to-End Latency: {total_single:.2f} ms")
    print(f"  • Target Latency:              < 300.00 ms (PASS: {total_single < 300.0})")
    print(f"  • Max Single-Thread Throughput: {fps_est:.1f} FPS")
    print("=" * 70)


if __name__ == "__main__":
    profile_pipeline()
