"""The heart of the check: from two cloud-free satellite pictures to a verdict.

Everything here is plain arithmetic on pixel arrays, with no network and no
language model, so it can be unit-tested and re-run exactly.

Steps:
  1. Count clear (cloud-free) pixels in each picture.
  2. Map forest in each picture (trained model, or NDVI fallback).
  3. Loss pixel = forest before, not forest after, and greenness dropped.
  4. Apply the verdict rules from config.yaml.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

BANDS = ["B02", "B03", "B04", "B08", "B11", "B12"]


@dataclass
class Composite:
    """A cloud-free picture of the area for one date window.

    bands: reflectance arrays (0..1), each shaped (rows, cols), NaN where cloudy.
    aoi:   True for pixels inside the forest boundary.
    """
    bands: dict[str, np.ndarray]
    aoi: np.ndarray
    pixel_area_ha: float = 0.01  # 10 m x 10 m
    scene_ids: list[str] = field(default_factory=list)

    @property
    def clear(self) -> np.ndarray:
        stack = np.stack([self.bands[b] for b in BANDS])
        return np.all(np.isfinite(stack), axis=0) & self.aoi


def safe_ratio(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        r = (a - b) / (a + b)
    return np.where(np.isfinite(r), r, np.nan)


def ndvi(c: Composite) -> np.ndarray:
    """Normalised Difference Vegetation Index: (NIR - Red) / (NIR + Red)."""
    return safe_ratio(c.bands["B08"], c.bands["B04"])


def ndmi(c: Composite) -> np.ndarray:
    """Normalised Difference Moisture Index: (NIR - SWIR1) / (NIR + SWIR1)."""
    return safe_ratio(c.bands["B08"], c.bands["B11"])


def features(c: Composite) -> np.ndarray:
    """Per-pixel features for the forest model: 6 bands + NDVI + NDMI -> (rows, cols, 8)."""
    layers = [c.bands[b] for b in BANDS] + [ndvi(c), ndmi(c)]
    return np.stack(layers, axis=-1)


def forest_probability(c: Composite, model=None, ndvi_threshold: float = 0.6) -> np.ndarray:
    """Probability (0..1) that each pixel is forest. NaN where not clear.

    With a trained model we use its probability. Without one we fall back to a
    simple rule: NDVI at or above the threshold counts as forest (probability 1).
    """
    clear = c.clear
    prob = np.full(clear.shape, np.nan)
    if model is None:
        v = ndvi(c)
        prob[clear] = (v[clear] >= ndvi_threshold).astype(float)
        return prob
    x = features(c)[clear]
    if len(x):
        prob[clear] = model.predict_proba(x)[:, 1]
    return prob


def analyze(before: Composite, after: Composite, cfg: dict, model=None) -> dict:
    """Compare the two pictures and return all numbers plus the verdict.

    Only pixels clear in BOTH pictures are compared, so clouds never look like tree loss.
    """
    fcfg, vcfg = cfg["forest"], cfg["verdict"]
    aoi = before.aoi & after.aoi
    area_ha = float(aoi.sum() * before.pixel_area_ha)
    both_clear = before.clear & after.clear & aoi
    clear_pct = 100.0 * both_clear.sum() / max(aoi.sum(), 1)

    p_before = forest_probability(before, model, fcfg["ndvi_fallback_threshold"])
    p_after = forest_probability(after, model, fcfg["ndvi_fallback_threshold"])
    thr = fcfg["forest_probability"]
    f_before = both_clear & (np.nan_to_num(p_before) >= thr)
    f_after = both_clear & (np.nan_to_num(p_after) >= thr)

    drop = np.nan_to_num(ndvi(before) - ndvi(after))
    # Clearing check that does not depend on the model. The forest model was trained on a broad
    # "tree cover" label and calls freshly cleared land "forest" once weeds and crops grow back.
    # The evaluation showed what still gives clearing away: the land loses moisture (NDMI, which
    # uses the short-wave infrared band) and greenness compared with the same months a year before.
    cleared = np.zeros_like(f_before)
    if "clearing_min_ndmi_drop" in fcfg:                      # rules-1.4 and later
        dm = np.nan_to_num(ndmi(before) - ndmi(after))
        cleared = both_clear & f_before & ((drop >= fcfg["clearing_min_ndvi_drop"])
                                           | (dm >= fcfg["clearing_min_ndmi_drop"]))
    elif "clearing_max_ndvi_after" in fcfg:                   # rules-1.3, kept so old checks re-run the same
        v_after = np.nan_to_num(ndvi(after), nan=1.0)
        cleared = (both_clear & f_before & (drop >= fcfg["clearing_min_ndvi_drop"])
                   & (v_after < fcfg["clearing_max_ndvi_after"]))
    # Recipes saved before rules-1.3 have no clearing settings and run exactly as before.
    f_after = f_after & ~cleared
    loss = (f_before & ~f_after & (drop >= fcfg["min_ndvi_drop_for_loss"])) | cleared

    lo, hi = fcfg["low_confidence_band"]
    unsure = both_clear & (
        ((p_before > lo) & (p_before < hi)) | ((p_after > lo) & (p_after < hi))
    )

    px = before.pixel_area_ha
    # Scale areas from the clear part up to the whole boundary is NOT done: we only
    # count what we actually saw ("when unsure, credit less").
    forest_before_ha = float(f_before.sum() * px)
    forest_after_ha = float(f_after.sum() * px)
    loss_ha = float(loss.sum() * px)
    loss_pct = 100.0 * loss_ha / forest_before_ha if forest_before_ha > 0 else 0.0
    cover_after_pct = 100.0 * forest_after_ha / area_ha if area_ha > 0 else 0.0
    low_conf_pct = 100.0 * unsure.sum() / max(both_clear.sum(), 1)

    numbers = {
        "area_ha": round(area_ha, 2),
        "clear_pct": round(clear_pct, 1),
        "forest_before_ha": round(forest_before_ha, 2),
        "forest_after_ha": round(forest_after_ha, 2),
        "forest_cover_after_pct": round(cover_after_pct, 1),
        "loss_ha": round(loss_ha, 2),
        "loss_pct": round(loss_pct, 2),
        "low_confidence_pct": round(low_conf_pct, 1),
        "mean_ndvi_before": _mean(ndvi(before), both_clear),
        "mean_ndvi_after": _mean(ndvi(after), both_clear),
        "method": "random_forest" if model is not None else "ndvi_rule",
    }
    verdict, reason = decide(numbers, vcfg, cfg.get("version"))
    masks = {"forest_before": f_before, "forest_after": f_after, "loss": loss,
             "clear": both_clear, "aoi": aoi}
    return {"numbers": numbers, "verdict": verdict, "reason": reason, "masks": masks}


def _mean(arr: np.ndarray, mask: np.ndarray) -> float:
    vals = arr[mask & np.isfinite(arr)]
    return round(float(vals.mean()), 3) if vals.size else 0.0


VERDICTS = ["Verified", "NeedsReview", "NotEligible", "CantCheckYet"]


def decide(n: dict, v: dict, version: str | None = None) -> tuple[str, str]:
    """The verdict rules, in order. Weak evidence can never become Verified.

    `version` is the rules version of the recipe. Checks saved under rules-1.0 and 1.1 keep their
    original wording, so re-running them gives exactly the same result hash."""
    if n["clear_pct"] < v["min_clear_pct"]:
        return "CantCheckYet", (
            f"Only {n['clear_pct']}% of the area was cloud-free in both pictures "
            f"(we need {v['min_clear_pct']}%). Try again with other dates.")
    if n["forest_after_ha"] < v["min_forest_ha"]:
        return "NotEligible", (
            f"Only {n['forest_after_ha']} ha of forest is visible now "
            f"(at least {v['min_forest_ha']} ha is needed). Try drawing a bigger area.")
    if n["forest_before_ha"] < v["min_forest_ha"]:
        return "NotEligible", (
            f"Only {n['forest_before_ha']} ha of forest was visible in the earlier picture "
            f"(at least {v['min_forest_ha']} ha is needed). Credits here are for forest that was "
            f"already standing, so a forest that appears only in the newer picture is not counted.")
    if n["forest_cover_after_pct"] < v["min_forest_cover_pct"]:
        return "NotEligible", (
            f"Only {n['forest_cover_after_pct']}% of the area is forest now "
            f"(at least {v['min_forest_cover_pct']}% is needed).")
    if n["loss_pct"] >= v["not_eligible_loss_pct"]:
        return "NotEligible", (
            f"Satellites show {n['loss_ha']} ha of tree loss, {n['loss_pct']}% of the forest "
            f"(the limit is {v['not_eligible_loss_pct']}%).")
    if n["loss_pct"] >= v["review_loss_pct"]:
        return "NeedsReview", (
            f"Satellites show {n['loss_pct']}% tree loss. That is small but not clearly zero, "
            f"so a person should take a look.")
    if n["low_confidence_pct"] > v["max_low_confidence_pct"]:
        if version in ("rules-1.0", "rules-1.1"):
            return "NeedsReview", (
                f"The forest map is unsure about {n['low_confidence_pct']}% of the area, "
                f"so a person should take a look.")
        return "NeedsReview", (
            f"The forest map is unsure about {n['low_confidence_pct']}% of the area, "
            f"so a person should take a look. This often happens with scrubland or scattered trees, "
            f"young plantations, or pictures taken when the trees have dropped their leaves.")
    return "Verified", (
        f"{n['forest_after_ha']} ha of forest is clearly visible and tree loss is "
        f"{n['loss_pct']}%, below the {v['review_loss_pct']}% review level.")
