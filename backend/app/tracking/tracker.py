"""IoU / centroid tracker with N-consecutive-frame identity confirmation."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.core.types import FaceObs


def iou(a, b) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def _centroid_close(a, b) -> bool:
    ca, cb = ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2), ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    diag = max(((a[2] - a[0]) ** 2 + (a[3] - a[1]) ** 2) ** 0.5, 1.0)
    return ((ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2) ** 0.5 < 0.6 * diag


@dataclass
class Track:
    id: int
    bbox: tuple
    misses: int = 0
    cand_pid: int | None = None
    streak: int = 0
    confirmed_pid: int | None = None
    best_score: float = 0.0
    marked: bool = False
    age: int = 0
    last_reverify: int = 0
    cached_name: str = "Unknown"
    recent_embeddings: list[np.ndarray] = None
    # liveness state
    seen_open: bool = False
    closed_frames: int = 0
    blinks: int = 0
    # compatibility aliases for callers and test suites
    track_id: int | None = None
    score: float | None = None

    def __post_init__(self):
        if self.track_id is not None:
            self.id = self.track_id
        else:
            self.track_id = self.id

        if self.score is not None:
            self.best_score = self.score
        else:
            self.score = self.best_score

        if self.recent_embeddings is None:
            self.recent_embeddings = []

    def needs_recognition(self, interval: int = 15) -> bool:
        """Determines if the track needs deep neural embedding & matching on this frame."""
        if self.confirmed_pid is None:
            return True
        return (self.age - self.last_reverify) >= interval

    def observe(self, obs: FaceObs, confirm_frames: int) -> None:
        self.bbox, self.misses = obs.bbox, 0
        self.age += 1

        # If a new embedding was computed, update re-verification and store in recent history
        if obs.embedding is not None:
            self.last_reverify = self.age
            self.recent_embeddings.append(obs.embedding)
            if len(self.recent_embeddings) > 5:
                self.recent_embeddings.pop(0)

        # If observation had person_id (either newly matched or cached)
        if obs.person_id is not None and obs.person_id == self.cand_pid:
            self.streak += 1
            self.best_score = max(self.best_score, obs.score)
        elif obs.person_id is not None:
            self.cand_pid = obs.person_id
            self.streak = 1
            self.best_score = obs.score
        elif self.confirmed_pid is None:
            # Unidentified sighting
            self.cand_pid = None
            self.streak = 0
            self.best_score = 0.0
        self.score = self.best_score

        if self.streak >= confirm_frames and self.cand_pid is not None:
            if self.confirmed_pid != self.cand_pid:
                self.marked = False
            self.confirmed_pid = self.cand_pid


class IoUTracker:
    def __init__(self, iou_thr: float = 0.3, max_age: int = 15, confirm_frames: int = 3, reverify_interval: int = 15) -> None:
        self.iou_thr, self.max_age, self.confirm_frames = iou_thr, max_age, confirm_frames
        self.reverify_interval = reverify_interval
        self.tracks: dict[int, Track] = {}
        self._next = 1

    def associate_detections(self, bboxes: list[tuple]) -> list[tuple[Track | None, bool]]:
        """Associates raw detection bboxes with existing tracks and flags whether each needs embedding & recognition."""
        free = set(self.tracks)
        unmatched = set(range(len(bboxes)))
        cand = sorted(((iou(self.tracks[tid].bbox, bboxes[j]), tid, j)
                       for tid in free for j in unmatched), reverse=True)
        matched_map: dict[int, Track] = {}
        for score, tid, j in cand:
            if score < self.iou_thr:
                break
            if tid in free and j in unmatched:
                free.discard(tid)
                unmatched.discard(j)
                matched_map[j] = self.tracks[tid]

        for tid in list(free):
            for j in list(unmatched):
                if _centroid_close(self.tracks[tid].bbox, bboxes[j]):
                    free.discard(tid)
                    unmatched.discard(j)
                    matched_map[j] = self.tracks[tid]
                    break

        res: list[tuple[Track | None, bool]] = []
        for j in range(len(bboxes)):
            t = matched_map.get(j)
            if t is None:
                res.append((None, True))
            else:
                res.append((t, t.needs_recognition(self.reverify_interval)))
        return res

    def update(self, observations: list[FaceObs]) -> list[tuple[Track, FaceObs]]:
        for t in self.tracks.values():
            t.misses += 1
        pairs: list[tuple[Track, FaceObs]] = []
        unmatched = set(range(len(observations)))
        free = set(self.tracks)
        cand = sorted(((iou(self.tracks[tid].bbox, observations[j].bbox), tid, j)
                       for tid in free for j in unmatched), reverse=True)
        for score, tid, j in cand:
            if score < self.iou_thr:
                break
            if tid in free and j in unmatched:
                free.discard(tid), unmatched.discard(j)
                pairs.append((self.tracks[tid], observations[j]))
        for tid in list(free):  # centroid fallback (fast motion with frame skipping)
            for j in list(unmatched):
                if _centroid_close(self.tracks[tid].bbox, observations[j].bbox):
                    free.discard(tid), unmatched.discard(j)
                    pairs.append((self.tracks[tid], observations[j]))
                    break
        for j in unmatched:
            t = Track(id=self._next, bbox=observations[j].bbox)
            self._next += 1
            self.tracks[t.id] = t
            pairs.append((t, observations[j]))
        for t, o in pairs:
            # If observation has no fresh embedding/match, propagate confirmed cached identity
            if o.person_id is None and t.confirmed_pid is not None and not t.needs_recognition(self.reverify_interval):
                o.person_id = t.confirmed_pid
                o.score = t.best_score
            t.observe(o, self.confirm_frames)
        for tid in [k for k, t in self.tracks.items() if t.misses > self.max_age]:
            del self.tracks[tid]
        return pairs
