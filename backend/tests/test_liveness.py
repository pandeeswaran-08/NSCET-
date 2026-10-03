"""Tests for Phase 3: Active and Passive Anti-Spoofing & Adaptive Gating."""
from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.liveness.active_liveness import CompositeLiveness
from app.liveness.anti_spoof import (
    check_color_gamut,
    check_moire_patterns,
    check_passive_liveness,
    check_specular_reflections,
)
from app.tracking.tracker import Track


def make_natural_skin_patch(size: int = 128) -> np.ndarray:
    """Generate image simulating natural human skin (smooth gradient + skin chrominance)."""
    # Natural skin tones in BGR: approx B=120, G=150, R=200
    img = np.zeros((size, size, 3), dtype=np.uint8)
    img[:, :, 0] = 120  # Blue
    img[:, :, 1] = 150  # Green
    img[:, :, 2] = 200  # Red

    # Add gentle spatial gradient and subtle noise
    for y in range(size):
        for x in range(size):
            img[y, x, 0] = np.clip(120 + (x - 64) // 4, 0, 255)
            img[y, x, 1] = np.clip(150 + (y - 64) // 4, 0, 255)
            img[y, x, 2] = np.clip(200 + (x + y - 128) // 6, 0, 255)

    # Subtle gaussian blur to simulate natural skin texture roll-off
    return cv2.GaussianBlur(img, (5, 5), 1.0)


def make_screen_replay_patch(size: int = 128) -> np.ndarray:
    """Generate image simulating an LCD screen with periodic high-frequency grid lines (moiré)."""
    base = make_natural_skin_patch(size)
    # Superimpose high-frequency grid pattern (every 2-3 pixels)
    grid = np.zeros((size, size), dtype=np.float32)
    grid[::3, :] += 40
    grid[:, ::3] += 40
    base = np.clip(base.astype(np.float32) + grid[:, :, None], 0, 255).astype(np.uint8)
    return base


def make_monochrome_printout(size: int = 128) -> np.ndarray:
    """Generate grayscale photocopy printout."""
    gray = np.random.default_rng(42).integers(50, 200, (size, size), dtype=np.uint8)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def test_moire_detection_on_screen():
    natural = make_natural_skin_patch()
    screen = make_screen_replay_patch()

    gray_natural = cv2.cvtColor(natural, cv2.COLOR_BGR2GRAY)
    gray_screen = cv2.cvtColor(screen, cv2.COLOR_BGR2GRAY)

    natural_moire = check_moire_patterns(gray_natural)
    screen_moire = check_moire_patterns(gray_screen)

    assert screen_moire > natural_moire
    assert natural_moire < 0.50


def test_color_gamut_distortion():
    natural = make_natural_skin_patch()
    monochrome = make_monochrome_printout()

    natural_gamut = check_color_gamut(natural)
    mono_gamut = check_color_gamut(monochrome)

    assert mono_gamut > 0.60
    assert natural_gamut < 0.40


def test_specular_screen_glare():
    natural = make_natural_skin_patch()
    glare = natural.copy()
    # Add harsh white reflection hotspot in center
    glare[50:75, 50:75] = 255

    glare_score = check_specular_reflections(glare)
    assert glare_score > 0.0


def test_passive_liveness_overall():
    natural = make_natural_skin_patch()
    res_natural = check_passive_liveness(natural)
    assert res_natural.is_live is True
    assert res_natural.score < 0.55

    screen = make_screen_replay_patch()
    res_screen = check_passive_liveness(screen)
    assert res_screen.score > res_natural.score


def test_composite_active_liveness_blink():
    liveness = CompositeLiveness(ear_threshold=0.21, min_blinks=1)
    track = Track(id=1, bbox=(0, 0, 100, 100))

    # 1. Start with open eyes
    for _ in range(5):
        liveness.update(track, ear=0.28)
    assert not liveness.is_live(track)

    # 2. Blink: eye closes for 2 frames
    liveness.update(track, ear=0.15)
    liveness.update(track, ear=0.14)

    # 3. Eye reopens
    liveness.update(track, ear=0.27)
    assert liveness.is_live(track)
    assert track.blinks == 1


def test_composite_active_liveness_micro_motion():
    liveness = CompositeLiveness(ear_threshold=0.21, min_blinks=1, motion_threshold=0.003)
    track = Track(id=2, bbox=(0, 0, 100, 100))

    # Eyes remain open without blinking (e.g. EAR=0.26)
    # But subject exhibits natural subtle head movements (yaw changes slightly)
    yaws = [0.01, 0.03, 0.02, 0.05, 0.04, 0.06, 0.03, 0.05, 0.02, 0.04]
    for y in yaws:
        liveness.update(track, ear=0.26, yaw=y, pitch=0.01)

    status = liveness.evaluate(track)
    assert status.is_live is True
    assert status.motion_score >= 0.003


def test_static_photo_rejected():
    liveness = CompositeLiveness(ear_threshold=0.21, min_blinks=1, motion_threshold=0.003)
    track = Track(id=3, bbox=(0, 0, 100, 100))

    # Static photo: exact same EAR and exact same zero yaw over 15 frames
    for _ in range(15):
        liveness.update(track, ear=0.26, yaw=0.0, pitch=0.0)

    status = liveness.evaluate(track)
    assert status.is_live is False
    assert any("blink or subtle head movement required" in r for r in status.reasons)
