"""Person registration with quality gates and duplicate-identity rejection."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
from loguru import logger

from app.core.config import Settings
from app.db.models import Person
from app.db.repository import ConflictError, Repository
from app.recognition.engine import RecognitionEngine
from app.recognition.gallery import Gallery
from app.core.types import FaceObs
from app.recognition.quality import check_face_quality
from app.utils.image import l2_normalize


def _box_area(box) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, float(x2 - x1)) * max(0.0, float(y2 - y1))


def _box_overlap(b1, b2) -> float:
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    a1, a2 = _box_area(b1), _box_area(b2)
    min_area = min(a1, a2)
    if min_area <= 0:
        return 0.0
    union = a1 + a2 - inter
    iou = inter / union if union > 0 else 0.0
    containment = inter / min_area
    return max(iou, containment)


def _resolve_registration_face(faces: list[FaceObs], min_face_px: int) -> tuple[FaceObs | None, list[str]]:
    if not faces:
        return None, ["no face detected"]

    # 1. Deduplicate overlapping detections of the same face
    deduped: list[FaceObs] = []
    sorted_faces = sorted(faces, key=lambda f: f.det_score or 0.0, reverse=True)
    for f in sorted_faces:
        if not any(_box_overlap(f.bbox, k.bbox) > 0.35 for k in deduped):
            deduped.append(f)

    if len(deduped) == 1:
        return deduped[0], []

    # 2. Filter out tiny background faces/noise (< min_face_px)
    significant = [
        f for f in deduped
        if min(f.bbox[2] - f.bbox[0], f.bbox[3] - f.bbox[1]) >= min_face_px * 0.75
    ]

    if len(significant) == 1:
        return significant[0], []

    candidates = significant if significant else deduped
    if len(candidates) > 1:
        # 3. Check if the largest face is clearly the dominant foreground subject (>= 2.0x area of 2nd)
        sorted_by_area = sorted(candidates, key=lambda f: _box_area(f.bbox), reverse=True)
        largest_area = _box_area(sorted_by_area[0].bbox)
        second_area = _box_area(sorted_by_area[1].bbox)
        if second_area > 0 and (largest_area / second_area) >= 2.0:
            return sorted_by_area[0], []

        return None, [f"{len(candidates)} faces detected; exactly one person required in camera view"]

    return candidates[0] if candidates else None, []


class RegistrationError(Exception):
    def __init__(self, message: str, rejected: list[dict] | None = None) -> None:
        super().__init__(message)
        self.message, self.rejected = message, rejected or []


class DuplicateIdentityError(Exception):
    pass


@dataclass
class RegistrationResult:
    person: Person
    accepted: int
    rejected: list[dict] = field(default_factory=list)


class RegistrationService:
    def __init__(self, get_engine: Callable[[], RecognitionEngine], repo: Repository,
                 gallery: Gallery, settings: Settings) -> None:
        self._get_engine, self.repo, self.gallery, self.s = get_engine, repo, gallery, settings

    def register(self, code: str, name: str, degree: str | None = None,
                 department: str | None = None, year: int | None = None,
                 images: list[np.ndarray | None] = [], raw: list[bytes] | None = None) -> RegistrationResult:
        s = self.s
        if self.repo.get_by_code(code) is not None:
            raise ConflictError(f"Person code '{code}' already exists")
        if len(images) < s.min_images:
            raise RegistrationError(f"Provide at least {s.min_images} images (got {len(images)})")
        images = images[: s.max_images]

        valid_idx = [i for i, im in enumerate(images) if im is not None]
        analyses = self._get_engine().analyze_frames([images[i] for i in valid_idx], match=False)
        by_idx = dict(zip(valid_idx, analyses))

        accepted: list[tuple[int, np.ndarray]] = []
        rejected: list[dict] = []
        for i, im in enumerate(images):
            if im is None:
                rejected.append({"index": i, "reasons": ["invalid image"]})
                continue
            faces = by_idx[i]
            target_face, face_errors = _resolve_registration_face(faces, s.min_face_px)
            if face_errors or target_face is None:
                rejected.append({"index": i, "reasons": face_errors or ["no face detected"]})
            else:
                f = target_face
                q = check_face_quality(im, f.bbox, f.kps, min_face_px=s.min_face_px,
                                       blur_threshold=s.blur_threshold, max_yaw=s.max_yaw,
                                       max_roll_deg=s.max_roll_deg)
                if q.ok:
                    accepted.append((i, f.embedding))
                else:
                    rejected.append({"index": i, "reasons": q.reasons})

        if len(accepted) >= 2:  # drop outliers (probably a different person in the set)
            mean = l2_normalize(np.mean([e for _, e in accepted], axis=0))
            keep = []
            for i, e in accepted:
                if float(e @ mean) < 0.35:
                    rejected.append({"index": i, "reasons": ["face does not match the other images"]})
                else:
                    keep.append((i, e))
            accepted = keep

        if len(accepted) < s.min_images:
            raise RegistrationError(
                f"Only {len(accepted)} usable image(s); need {s.min_images}", sorted(rejected, key=lambda r: r["index"]))

        embs = [e for _, e in accepted]
        mean = l2_normalize(np.mean(embs, axis=0))

        self.gallery.refresh_if_stale()
        score, pid = (float(x[0]) for x in self.gallery.search(mean[None]))
        if pid >= 0 and score > s.duplicate_threshold:
            raise DuplicateIdentityError(
                f"Face already registered as '{self.gallery.name_of(int(pid))}' (similarity {score:.2f})")

        person = self.repo.create_person(code, name, degree, department, year, mean, embs)
        if s.store_raw_images and raw:
            folder = Path(s.raw_dir) / code
            folder.mkdir(parents=True, exist_ok=True)
            for i, _ in accepted:
                (folder / f"{i}.jpg").write_bytes(raw[i])
        self.gallery.rebuild()
        logger.info(f"Registered {code} ({name}) with {len(embs)} embeddings")
        return RegistrationResult(person, len(embs), sorted(rejected, key=lambda r: r["index"]))
