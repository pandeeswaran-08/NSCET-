"""Accuracy evaluation (FAR / FRR / ROC / EER) on a labeled folder dataset.

Dataset layout:  root/<person_name>/*.jpg   (>= 2 images per person, >= 2 persons)

Usage: python scripts/evaluate.py --root dataset/ --out eval_out/ [--target-far 0.001]
"""
import sys as _sys
from pathlib import Path as _P
_sys.path.insert(0, str(_P(__file__).resolve().parents[1]))

import argparse
import itertools
import json
from pathlib import Path

import cv2
import numpy as np

from app.utils.metrics import auc, compute_roc, equal_error_rate, threshold_at_far

EXT = {".jpg", ".jpeg", ".png", ".bmp"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", default="eval_out")
    ap.add_argument("--target-far", type=float, default=0.001)
    a = ap.parse_args()

    from app.core.config import get_settings
    from app.services.container import Container

    c = Container(get_settings())
    engine = c.get_engine()

    embs: dict[str, list[np.ndarray]] = {}
    skipped = 0
    for pdir in sorted(p for p in Path(a.root).iterdir() if p.is_dir()):
        for f in sorted(pdir.iterdir()):
            if f.suffix.lower() not in EXT:
                continue
            img = cv2.imread(str(f))
            faces = engine.analyze_frames([img], match=False)[0] if img is not None else []
            if len(faces) != 1:
                skipped += 1
                continue
            embs.setdefault(pdir.name, []).append(faces[0].embedding)
    embs = {k: v for k, v in embs.items() if len(v) >= 2}
    if len(embs) < 2:
        raise SystemExit("Need at least 2 persons with >= 2 usable images each")

    genuine, impostor = [], []
    for v in embs.values():
        genuine += [float(x @ y) for x, y in itertools.combinations(v, 2)]
    for (_, v1), (_, v2) in itertools.combinations(embs.items(), 2):
        impostor += [float(x @ y) for x in v1 for y in v2]
    genuine, impostor = np.array(genuine), np.array(impostor)

    roc = compute_roc(genuine, impostor)
    eer, eer_thr = equal_error_rate(roc)
    thr_far = threshold_at_far(roc, a.target_far)
    summary = {
        "persons": len(embs), "images_skipped": skipped,
        "genuine_pairs": int(genuine.size), "impostor_pairs": int(impostor.size),
        "AUC": round(auc(roc), 5), "EER": round(eer, 5), "EER_threshold": round(eer_thr, 3),
        f"threshold_at_FAR<={a.target_far}": round(thr_far, 3),
        "FRR_at_that_threshold": round(float((genuine < thr_far).mean()), 5),
    }
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    np.savetxt(out / "roc.csv", np.c_[roc["thresholds"], roc["far"], roc["frr"]], delimiter=",",
               header="threshold,far,frr", comments="")
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(1, 2, figsize=(11, 4))
        ax[0].plot(roc["far"], roc["tpr"])
        ax[0].set(xlabel="FAR", ylabel="TPR (1-FRR)", title=f"ROC (AUC={summary['AUC']})", xscale="log", xlim=(1e-4, 1))
        ax[1].plot(roc["thresholds"], roc["far"], label="FAR")
        ax[1].plot(roc["thresholds"], roc["frr"], label="FRR")
        ax[1].axvline(eer_thr, ls="--", c="gray")
        ax[1].set(xlabel="cosine threshold", title=f"EER={summary['EER']:.3f} @ {summary['EER_threshold']}")
        ax[1].legend()
        fig.tight_layout()
        fig.savefig(out / "roc.png", dpi=130)
    except Exception as exc:  # noqa: BLE001
        print(f"Plot skipped: {exc}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
