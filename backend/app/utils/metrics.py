"""Verification metrics: FAR / FRR / ROC / EER."""
from __future__ import annotations

import numpy as np


def compute_roc(genuine: np.ndarray, impostor: np.ndarray, num: int = 201) -> dict[str, np.ndarray]:
    """Cosine-similarity scores. Accept when score >= threshold."""
    genuine = np.asarray(genuine, dtype=np.float64)
    impostor = np.asarray(impostor, dtype=np.float64)
    thr = np.linspace(-1.0, 1.0, num)
    frr = np.array([(genuine < t).mean() if genuine.size else 0.0 for t in thr])
    far = np.array([(impostor >= t).mean() if impostor.size else 0.0 for t in thr])
    return {"thresholds": thr, "far": far, "frr": frr, "tpr": 1.0 - frr}


def equal_error_rate(roc: dict[str, np.ndarray]) -> tuple[float, float]:
    idx = int(np.argmin(np.abs(roc["far"] - roc["frr"])))
    return float((roc["far"][idx] + roc["frr"][idx]) / 2), float(roc["thresholds"][idx])


def auc(roc: dict[str, np.ndarray]) -> float:
    order = np.argsort(roc["far"])
    x, y = roc["far"][order], roc["tpr"][order]
    return float(np.sum((x[1:] - x[:-1]) * (y[1:] + y[:-1]) / 2))


def threshold_at_far(roc: dict[str, np.ndarray], target_far: float) -> float:
    ok = np.where(roc["far"] <= target_far)[0]
    return float(roc["thresholds"][ok[0]]) if ok.size else 1.0
