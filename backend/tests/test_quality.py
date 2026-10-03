import cv2
import numpy as np

from app.recognition.quality import check_face_quality, estimate_pose

KW = dict(min_face_px=80, blur_threshold=40.0, max_yaw=0.35, max_roll_deg=25.0)
FRONTAL = np.array([[70, 80], [130, 80], [100, 105], [75, 135], [125, 135]], np.float32)


def sharp(n=240):
    return np.random.default_rng(0).integers(0, 255, (n, n, 3), dtype=np.uint8)


def test_ok():
    assert check_face_quality(sharp(), (20, 20, 220, 220), FRONTAL, **KW).ok


def test_blurry_rejected():
    blurry = cv2.GaussianBlur(sharp(), (0, 0), 15)
    r = check_face_quality(blurry, (20, 20, 220, 220), FRONTAL, **KW)
    assert not r.ok and any("blurry" in x for x in r.reasons)


def test_small_face_rejected():
    r = check_face_quality(sharp(), (100, 100, 140, 140), FRONTAL, **KW)
    assert any("small" in x for x in r.reasons)


def test_pose_limits():
    turned = FRONTAL.copy()
    turned[2, 0] = 125  # nose near right eye
    assert abs(estimate_pose(turned)[0]) > 0.35
    assert not check_face_quality(sharp(), (20, 20, 220, 220), turned, **KW).ok
    tilted = FRONTAL.copy()
    tilted[1, 1] = 130
    assert any("tilted" in x for x in check_face_quality(sharp(), (20, 20, 220, 220), tilted, **KW).reasons)
