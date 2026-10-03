import numpy as np

from app.recognition.matcher import NumpyMatcher
from app.utils.image import l2_normalize
from app.utils.metrics import auc, compute_roc, equal_error_rate


def test_best_match_and_unknown():
    rng = np.random.default_rng(0)
    g = l2_normalize(rng.normal(size=(5, 512)))
    m = NumpyMatcher()
    m.build(g, np.array([10, 10, 20, 30, 30]))
    q = l2_normalize(g[2] + rng.normal(size=512) * 0.02)[None]
    s, l = m.search(q)
    assert l[0] == 20 and s[0] > 0.9
    s2, _ = m.search(l2_normalize(rng.normal(size=(1, 512))))
    assert s2[0] < 0.45


def test_empty_gallery():
    s, l = NumpyMatcher().search(np.zeros((2, 512), np.float32))
    assert (l == -1).all()


def test_multiple_queries_vectorised():
    g = np.eye(512, dtype=np.float32)[:4]
    m = NumpyMatcher()
    m.build(g, np.arange(4))
    s, l = m.search(g[[3, 1]])
    assert list(l) == [3, 1] and np.allclose(s, 1.0)


def test_roc_metrics():
    gen = np.random.default_rng(1).normal(0.7, 0.1, 500)
    imp = np.random.default_rng(2).normal(0.1, 0.1, 500)
    roc = compute_roc(gen, imp)
    eer, thr = equal_error_rate(roc)
    assert eer < 0.01 and 0.2 < thr < 0.6 and auc(roc) > 0.99
