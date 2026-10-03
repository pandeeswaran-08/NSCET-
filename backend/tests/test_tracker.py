from app.core.types import FaceObs
from app.tracking.tracker import IoUTracker


def obs(x, pid):
    return FaceObs(bbox=(x, 10, x + 50, 70), det_score=0.9, person_id=pid, score=0.7)


def test_confirms_after_n_consecutive_frames():
    t = IoUTracker(confirm_frames=3)
    for i in range(2):
        (tr, _), = t.update([obs(10 + i, 5)])
        assert tr.confirmed_pid is None
    (tr, _), = t.update([obs(12, 5)])
    assert tr.confirmed_pid == 5


def test_flicker_resets_streak():
    t = IoUTracker(confirm_frames=3)
    t.update([obs(10, 5)]); t.update([obs(11, 5)]); t.update([obs(12, None)])
    (tr, _), = t.update([obs(12, 5)])
    assert tr.confirmed_pid is None


def test_two_faces_two_tracks():
    t = IoUTracker()
    pairs = t.update([obs(10, 1), obs(300, 2)])
    assert len({tr.id for tr, _ in pairs}) == 2
