"""Download YOLO face weights and warm up InsightFace buffalo_l.

Usage: python scripts/download_models.py [--size s|n]
"""
import sys as _sys
from pathlib import Path as _P
_sys.path.insert(0, str(_P(__file__).resolve().parents[1]))

import argparse
import sys
import urllib.request
from pathlib import Path

URLS = {
    "s": ["https://github.com/akanametov/yolo-face/releases/download/v0.0.0/yolov11s-face.pt",
          "https://github.com/akanametov/yolo-face/releases/download/1.0.0/yolov11s-face.pt"],
    "n": ["https://github.com/akanametov/yolo-face/releases/download/1.0.0/yolov11n-face.pt",
          "https://github.com/akanametov/yolo-face/releases/download/v0.0.0/yolov11n-face.pt"],
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", default="s", choices=["s", "n"])
    ap.add_argument("--models-dir", default="models")
    a = ap.parse_args()
    out = Path(a.models_dir)
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"yolov11{a.size}-face.pt"
    if not dest.exists():
        for url in URLS[a.size]:
            try:
                print(f"Downloading {url}")
                urllib.request.urlretrieve(url, dest)
                break
            except Exception as exc:  # noqa: BLE001
                print(f"  failed: {exc}")
        else:
            sys.exit("Could not download YOLO weights. Get them from https://github.com/akanametov/yolo-face/releases "
                     f"and save as {dest}")
    print(f"YOLO weights: {dest}")
    from app.recognition.embedder import InsightFaceEmbedder

    InsightFaceEmbedder("buffalo_l", str(out / "insightface"), "cpu")
    print("InsightFace buffalo_l ready")


if __name__ == "__main__":
    main()
