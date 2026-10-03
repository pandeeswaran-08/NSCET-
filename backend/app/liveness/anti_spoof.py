"""Passive face anti-spoofing: texture, moiré frequency spectrum, and chrominance gamut analysis."""
from __future__ import annotations

from dataclasses import dataclass, field
import cv2
import numpy as np


@dataclass(slots=True)
class AntiSpoofResult:
    is_live: bool
    score: float  # 0.0 (definitely real) to 1.0 (definitely spoof)
    reasons: list[str] = field(default_factory=list)


def check_moire_patterns(gray_face: np.ndarray) -> float:
    """Detect high-frequency periodic grid noise characteristic of LCD/OLED screens via 2D FFT."""
    h, w = gray_face.shape
    if h < 32 or w < 32:
        return 0.0

    # Resize to canonical 128x128 for uniform frequency spectrum analysis
    norm_face = cv2.resize(gray_face, (128, 128))
    f = np.fft.fft2(norm_face.astype(np.float32))
    fshift = np.fft.fftshift(f)
    magnitude = 20 * np.log(np.abs(fshift) + 1e-6)

    # Center (low frequency) mask vs high-frequency annular mask
    cy, cx = 64, 64
    y, x = np.ogrid[:128, :128]
    dist_from_center = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)

    # High frequency outer ring (35px to 60px radius)
    outer_ring = (dist_from_center >= 35) & (dist_from_center <= 60)
    inner_core = dist_from_center < 20

    high_freq_energy = float(np.mean(magnitude[outer_ring]))
    low_freq_energy = float(np.mean(magnitude[inner_core])) + 1e-6

    ratio = high_freq_energy / low_freq_energy
    # Natural human skin has a fast exponential frequency roll-off (ratio < 0.68)
    # Screens display sharp pixel grids with elevated high-frequency harmonics (ratio > 0.78)
    moire_score = float(np.clip((ratio - 0.65) / 0.20, 0.0, 1.0))
    return moire_score


def check_color_gamut(bgr_face: np.ndarray) -> float:
    """Analyze chrominance distribution in YCbCr space to detect printed or re-photographed media."""
    if bgr_face.size == 0:
        return 0.0

    ycbcr = cv2.cvtColor(bgr_face, cv2.COLOR_BGR2YCrCb)
    y_chan = ycbcr[:, :, 0]
    cr_chan = ycbcr[:, :, 1]
    cb_chan = ycbcr[:, :, 2]

    # Skin standard deviations
    std_y = float(np.std(y_chan))
    std_cr = float(np.std(cr_chan))
    std_cb = float(np.std(cb_chan))

    chroma_std = std_cr + std_cb
    if chroma_std < 1e-4:
        return 1.0  # Completely monochromatic / photocopy

    # Ratio of luminance variance to chrominance variance
    # Printouts and compressed screens have heavily crushed chrominance compared to real skin
    lum_chroma_ratio = std_y / chroma_std
    gamut_score = 0.0
    if lum_chroma_ratio > 4.5:
        gamut_score = float(np.clip((lum_chroma_ratio - 4.5) / 3.0, 0.0, 1.0))
    elif chroma_std < 4.5:
        gamut_score = float(np.clip((4.5 - chroma_std) / 3.0, 0.0, 1.0))

    return gamut_score


def check_specular_reflections(bgr_face: np.ndarray) -> float:
    """Detect localized intense specular glare typical of protective phone glass and glossy paper."""
    if bgr_face.size == 0:
        return 0.0

    gray = cv2.cvtColor(bgr_face, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    total_pixels = h * w
    if total_pixels == 0:
        return 0.0

    # Find saturated bright spots (> 250 in 8-bit)
    saturated = (gray >= 250).astype(np.uint8)
    saturated_count = int(np.sum(saturated))
    sat_ratio = saturated_count / total_pixels

    # Check compactness of saturated regions (phone screen flash produces tight hot spots)
    if sat_ratio > 0.015:
        contours, _ = cv2.findContours(saturated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if len(contours) > 0:
            max_contour_area = max(cv2.contourArea(c) for c in contours)
            if max_contour_area / total_pixels > 0.008:
                return float(np.clip(sat_ratio * 40.0, 0.0, 1.0))

    return 0.0


def check_passive_liveness(
    bgr_crop: np.ndarray,
    threshold: float = 0.55,
) -> AntiSpoofResult:
    """
    Perform passive multi-cue anti-spoofing check on a 112x112 or original face crop.
    
    Returns AntiSpoofResult with:
      - is_live: True if human face, False if presentation attack
      - score: composite spoof probability in [0.0, 1.0]
      - reasons: diagnostic feedback on why it was classified as spoof
    """
    if bgr_crop.size == 0:
        return AntiSpoofResult(is_live=False, score=1.0, reasons=["empty face region"])

    gray = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2GRAY)

    moire = check_moire_patterns(gray)
    gamut = check_color_gamut(bgr_crop)
    specular = check_specular_reflections(bgr_crop)

    # Weighted composite spoof probability
    # Moiré is strongest for screens, gamut for paper/printouts, specular for phone glass
    composite_spoof = float(
        0.50 * moire +
        0.35 * gamut +
        0.15 * specular
    )

    reasons = []
    if moire > 0.60:
        reasons.append("screen moiré pattern detected")
    if gamut > 0.60:
        reasons.append("paper/gamut distortion detected")
    if specular > 0.60:
        reasons.append("screen/glass reflection glare detected")

    is_live = composite_spoof < threshold and len(reasons) == 0

    return AntiSpoofResult(
        is_live=is_live,
        score=round(composite_spoof, 3),
        reasons=reasons,
    )
