"""Pixel-level measurements for one area, used to choose and test the clearing rule.

Returns a sparse histogram of the pixels that were forest in the earlier picture:
(NDVI drop, NDMI drop, NDVI after, model still says forest after) -> count.
Nothing is saved and nothing goes on-chain.
"""
from __future__ import annotations

from collections import Counter

import numpy as np

from . import analysis, pipeline, satellite
from .model import load_model
from .settings import config


def _bin(a, step, lo, hi):
    return np.clip(np.floor((np.nan_to_num(a) - lo) / step), 0, int(round((hi - lo) / step)) - 1).astype(int)


def measure(boundary: dict, before: tuple[str, str], after: tuple[str, str]) -> dict:
    cfg = config()
    model, info = load_model()
    rec = pipeline.build_recipe(boundary, before, after)
    cb, _ = satellite.load_composite(rec["boundary"], rec["scenes"]["before"], cfg["satellite"])
    ca, _ = satellite.load_composite(rec["boundary"], rec["scenes"]["after"], cfg["satellite"])
    f = cfg["forest"]
    clear = cb.aoi & ca.aoi & cb.clear & ca.clear
    pb = np.nan_to_num(analysis.forest_probability(cb, model, f["ndvi_fallback_threshold"]))
    pa = np.nan_to_num(analysis.forest_probability(ca, model, f["ndvi_fallback_threshold"]))
    fb = clear & (pb >= f["forest_probability"])
    fa = clear & (pa >= f["forest_probability"])
    dn = analysis.ndvi(cb) - analysis.ndvi(ca)
    dm = analysis.ndmi(cb) - analysis.ndmi(ca)
    na = analysis.ndvi(ca)
    keys = zip(_bin(dn, 0.05, -1, 1)[fb], _bin(dm, 0.05, -1, 1)[fb], _bin(na, 0.05, -1, 1)[fb], fa[fb].astype(int))
    hist = Counter(keys)
    return {
        "bins": "index i of a 0.05 step from -1: value = -1 + 0.05*i (lower edge)",
        "aoi_px": int((cb.aoi & ca.aoi).sum()),
        "clear_px": int(clear.sum()),
        "forest_before_px": int(fb.sum()),
        "forest_after_model_px": int(fa.sum()),
        "pixel_area_ha": cb.pixel_area_ha,
        "model": info.get("version"),
        "scenes": {"before": len(rec["scenes"]["before"]), "after": len(rec["scenes"]["after"])},
        "hist": [[int(a), int(b), int(c), int(d), int(n)] for (a, b, c, d), n in hist.items()],
    }
