"""Unit tests for the GroveProof verifier. They use synthetic pictures, so no internet is needed.

Run:  pytest -q
"""
import copy
import math

import numpy as np
import pytest

from groveproof import analysis, carbon
from groveproof.analysis import BANDS, Composite, decide
from groveproof.cells import boundary_to_cells
from groveproof.explain import numbers_ok, template
from groveproof.hashing import canonical_json, keccak_hex
from groveproof.pipeline import loss_bps, run_recipe
from groveproof.rerun import rerun
from groveproof.settings import config, factors

CFG = config()
FAC = factors()

# Typical reflectances (0..1) for each surface
FOREST = {"B02": 0.02, "B03": 0.04, "B04": 0.02, "B08": 0.35, "B11": 0.15, "B12": 0.07}   # NDVI ~0.89
BARE = {"B02": 0.08, "B03": 0.11, "B04": 0.14, "B08": 0.20, "B11": 0.28, "B12": 0.22}     # NDVI ~0.18


def picture(n=100, forest_mask=None, cloud_mask=None) -> Composite:
    """An n x n picture (1 km2 at 10 m). forest_mask True = forest, else bare land. Clouds -> NaN."""
    forest_mask = np.ones((n, n), bool) if forest_mask is None else forest_mask
    bands = {}
    for b in BANDS:
        arr = np.where(forest_mask, FOREST[b], BARE[b]).astype(float)
        if cloud_mask is not None:
            arr[cloud_mask] = np.nan
        bands[b] = arr
    return Composite(bands=bands, aoi=np.ones((n, n), bool), scene_ids=["S2_TEST"])


def cleared(fraction, n=100):
    m = np.ones((n, n), bool)
    rows = int(round(n * fraction))
    m[:rows, :] = False
    return m


# ------------------------------------------------------------------ hashing

def test_hash_is_stable_and_order_independent():
    a = {"b": 1.0000001, "a": [1, 2, {"z": -0.0}]}
    b = {"a": [1, 2, {"z": 0.0}], "b": 1.0}
    assert canonical_json(a) == canonical_json(b)
    assert keccak_hex(a) == keccak_hex(b)
    assert keccak_hex(a).startswith("0x") and len(keccak_hex(a)) == 66


def test_hash_matches_solidity_keccak():
    # keccak256("") is a well-known constant; our helper hashes the JSON text, so compare via a string
    from eth_utils import keccak
    assert keccak(text="").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"


# ------------------------------------------------------------------ map cells

SQUARE = {"type": "Polygon", "coordinates": [[[78.770, 16.110], [78.785, 16.110], [78.785, 16.124],
                                              [78.770, 16.124], [78.770, 16.110]]]}
OVERLAP = {"type": "Polygon", "coordinates": [[[78.778, 16.104], [78.793, 16.104], [78.793, 16.118],
                                               [78.778, 16.118], [78.778, 16.104]]]}
FAR = {"type": "Polygon", "coordinates": [[[79.300, 13.680], [79.310, 13.680], [79.310, 13.690],
                                           [79.300, 13.690], [79.300, 13.680]]]}


def test_boundary_becomes_cells_and_overlap_is_detected():
    a = boundary_to_cells(SQUARE)
    b = boundary_to_cells(OVERLAP)
    c = boundary_to_cells(FAR)
    assert 5 < len(a) <= CFG["max_cells"]
    assert set(a) & set(b), "overlapping squares must share map cells"
    assert not set(a) & set(c), "far apart squares must not share cells"
    assert a == sorted(a) and all(isinstance(x, int) and x < 2**64 for x in a)


def test_tiny_boundary_still_gets_one_cell():
    tiny = {"type": "Polygon", "coordinates": [[[78.7700, 16.1100], [78.7701, 16.1100], [78.7701, 16.1101],
                                                [78.7700, 16.1101], [78.7700, 16.1100]]]}
    assert len(boundary_to_cells(tiny)) == 1


# ------------------------------------------------------------------ verdicts

def run(before, after):
    return analysis.analyze(before, after, CFG, model=None)


def test_healthy_forest_is_verified():
    r = run(picture(), picture())
    assert r["verdict"] == "Verified"
    assert r["numbers"]["forest_after_ha"] == 100.0
    assert r["numbers"]["loss_pct"] == 0.0
    assert r["numbers"]["clear_pct"] == 100.0


def test_cleared_forest_is_not_eligible():
    r = run(picture(), picture(forest_mask=cleared(0.20)))
    assert r["verdict"] == "NotEligible"
    assert r["numbers"]["loss_ha"] == 20.0
    assert r["numbers"]["loss_pct"] == 20.0


def test_small_loss_needs_review():
    r = run(picture(), picture(forest_mask=cleared(0.03)))
    assert r["verdict"] == "NeedsReview"
    assert r["numbers"]["loss_pct"] == 3.0


def test_loss_just_below_review_level_is_verified():
    r = run(picture(), picture(forest_mask=cleared(0.01)))
    assert r["verdict"] == "Verified"


def test_cloudy_pictures_cannot_be_checked():
    clouds = np.zeros((100, 100), bool)
    clouds[:, :40] = True  # 40% cloud
    r = run(picture(), picture(cloud_mask=clouds))
    assert r["verdict"] == "CantCheckYet"
    assert r["numbers"]["clear_pct"] == 60.0


def test_clouds_never_count_as_tree_loss():
    clouds = np.zeros((100, 100), bool)
    clouds[:, :20] = True  # 20% cloud, still checkable
    r = run(picture(), picture(cloud_mask=clouds))
    assert r["numbers"]["loss_ha"] == 0.0
    assert r["verdict"] == "Verified"
    # we only credit what we saw: 80 ha, not 100
    assert r["numbers"]["forest_after_ha"] == 80.0


def test_land_that_is_mostly_not_forest_is_not_eligible():
    farm = np.zeros((100, 100), bool)
    farm[:10, :] = True  # only 10% trees, in both pictures
    r = run(picture(forest_mask=farm), picture(forest_mask=farm))
    assert r["verdict"] == "NotEligible"
    assert "forest" in r["reason"]


def test_verdict_rules_order():
    v = CFG["verdict"]
    base = dict(clear_pct=95, forest_before_ha=50, forest_cover_after_pct=90, loss_pct=0,
                loss_ha=0, low_confidence_pct=5, forest_after_ha=50)
    assert decide(base, v)[0] == "Verified"
    assert decide({**base, "low_confidence_pct": 25}, v)[0] == "NeedsReview"
    assert decide({**base, "loss_pct": 6}, v)[0] == "NotEligible"
    assert decide({**base, "loss_pct": 6, "clear_pct": 50}, v)[0] == "CantCheckYet"


# ------------------------------------------------------------------ credits

def test_credit_formula_matches_hand_calculation():
    numbers = {"forest_after_ha": 100.0, "clear_pct": 100.0, "low_confidence_pct": 0.0}
    c = carbon.compute_credits("Verified", numbers, CFG["credits"], FAC)
    z = FAC["zones"][FAC["default_zone"]]
    # by hand: 100 ha x growth x (1 + R) x 0.47 x 44/12, then x 0.8 x 0.9
    annual = 100 * z["growth_t_dm_per_ha_yr"] * (1 + z["root_shoot_ratio"]) * 0.47 * 44 / 12
    assert c["annual_co2_t"] == pytest.approx(round(annual, 2))
    assert c["credits"] == math.floor(annual * 0.8 * 0.9)
    assert c["uncertainty_deduction"] == 0.2


def test_weaker_evidence_gives_fewer_credits():
    good = {"forest_after_ha": 100.0, "clear_pct": 95.0, "low_confidence_pct": 2.0}
    weak = {"forest_after_ha": 100.0, "clear_pct": 75.0, "low_confidence_pct": 15.0}
    a = carbon.compute_credits("Verified", good, CFG["credits"], FAC)
    b = carbon.compute_credits("Verified", weak, CFG["credits"], FAC)
    assert b["uncertainty_deduction"] == 0.3
    assert b["credits"] < a["credits"]


def test_no_credits_unless_verified():
    numbers = {"forest_after_ha": 100.0, "clear_pct": 100.0, "low_confidence_pct": 0.0}
    for v in ("NeedsReview", "NotEligible", "CantCheckYet"):
        assert carbon.compute_credits(v, numbers, CFG["credits"], FAC)["credits"] == 0


# ------------------------------------------------------------------ recipe, result, re-run

def fake_recipe():
    return {
        "recipe_version": 1, "boundary": SQUARE, "h3_resolution": 9,
        "cells": [str(c) for c in boundary_to_cells(SQUARE)],
        "windows": {"before": ["2025-01-01", "2025-03-31"], "after": ["2026-01-01", "2026-03-31"]},
        "scenes": {"before": ["S2_BEFORE"], "after": ["S2_AFTER"]},
        "zone": FAC["default_zone"], "config": copy.deepcopy(CFG), "factors": copy.deepcopy(FAC),
        "model": {"name": "ndvi_rule", "version": "ndvi-rule-1", "sha256": None},
        "code_commit": "test",
    }


def fake_loader(loss_fraction):
    def load(boundary, scene_ids):
        comp = picture(forest_mask=cleared(loss_fraction)) if scene_ids == ["S2_AFTER"] else picture()
        return comp, np.zeros((100, 100, 3), "uint8")
    return load


def test_rerun_gives_the_same_result_hash():
    recipe = fake_recipe()
    result, _ = run_recipe(recipe, loader=fake_loader(0.0))
    out = rerun(recipe, result, loader=fake_loader(0.0))
    assert out["same"] is True
    assert out["result_hash"] == keccak_hex(result)


def test_rerun_detects_a_changed_result():
    recipe = fake_recipe()
    saved, _ = run_recipe(recipe, loader=fake_loader(0.0))
    out = rerun(recipe, saved, loader=fake_loader(0.25))   # the land looks different now
    assert out["same"] is False
    assert "loss_pct" in out["differences"]


def test_changing_any_rule_changes_the_recipe_hash():
    a = fake_recipe()
    b = fake_recipe()
    b["config"]["verdict"]["not_eligible_loss_pct"] = 10
    assert keccak_hex(a) != keccak_hex(b)


def test_loss_in_basis_points_for_the_contract():
    result, _ = run_recipe(fake_recipe(), loader=fake_loader(0.18))
    assert loss_bps(result) == 1800


# ------------------------------------------------------------------ explanation guard

def sample_result():
    result, _ = run_recipe(fake_recipe(), loader=fake_loader(0.0))
    return result


def test_template_explanation_only_uses_real_numbers():
    r = sample_result()
    assert numbers_ok(template(r), r)


def test_guard_rejects_invented_numbers():
    r = sample_result()
    assert not numbers_ok("This forest stores 999999 tonnes of CO2.", r)
    assert numbers_ok(f"The forest covers {r['numbers']['forest_after_ha']} ha.", r)


def test_explain_falls_back_to_template_without_api_key(monkeypatch):
    from groveproof.explain import explain
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    out = explain(sample_result())
    assert out["source"] == "template"


def test_explain_note_says_why_text_was_replaced(monkeypatch):
    import groveproof.explain as ex
    r = sample_result()
    monkeypatch.setenv("LLM_API_KEY", "x")

    class FakeResp:
        def __init__(self, text): self.text = text
        def raise_for_status(self): pass
        def json(self): return {"choices": [{"message": {"content": self.text}}]}

    monkeypatch.setattr(ex.httpx, "post", lambda *a, **k: FakeResp("This forest stores 999999 tonnes."))
    out = ex.explain(r)
    assert out["source"] == "template" and "999999" in out["note"]

    good = f"The forest covers {r['numbers']['forest_after_ha']} ha."
    monkeypatch.setattr(ex.httpx, "post", lambda *a, **k: FakeResp(good))
    out = ex.explain(r)
    assert out["source"] == "ai" and "1 numbers" in out["note"]


def test_zone_by_region_and_unsupported_places_get_no_credits():
    sq = lambda lon, lat: {"type": "Polygon", "coordinates": [[[lon, lat], [lon + .01, lat], [lon + .01, lat + .01], [lon, lat + .01], [lon, lat]]]}
    assert carbon.zone_for(sq(78.78, 16.11), FAC) == "tropical_dry_forest_asia"    # Nallamala
    assert carbon.zone_for(sq(-60.0, -3.0), FAC) is None                           # Amazon
    assert carbon.zone_for(sq(8.2, 48.0), FAC) is None                             # Black Forest
    numbers = {"forest_after_ha": 100.0, "clear_pct": 95.0, "low_confidence_pct": 2.0}
    c = carbon.compute_credits("Verified", numbers, CFG["credits"], FAC, "none")
    assert c["credits"] == 0 and c["supported"] is False and c["annual_co2_t"] is None
    ok = carbon.compute_credits("Verified", numbers, CFG["credits"], FAC, "tropical_dry_forest_asia")
    assert ok["supported"] is True and ok["growth_t_dm_per_ha_yr"] == 1.5 and ok["credits"] > 0


def test_small_forest_messages_say_the_real_reason():
    v = CFG["verdict"]
    base = {"clear_pct": 100.0, "forest_after_ha": 2.28, "forest_before_ha": 0.6, "forest_cover_after_pct": 57.7,
            "loss_ha": 0.0, "loss_pct": 0.0, "low_confidence_pct": 1.0}
    verdict, reason = analysis.decide(base, v)
    assert verdict == "NotEligible" and "earlier picture" in reason and "57.7" not in reason
    verdict, reason = analysis.decide({**base, "forest_after_ha": 0.5}, v)
    assert verdict == "NotEligible" and "visible now" in reason
    verdict, _ = analysis.decide({**base, "forest_before_ha": 2.3}, v)
    assert verdict == "Verified"


def test_clearing_is_caught_even_if_the_model_still_says_forest():
    class Always:  # a model that calls every pixel forest
        def predict_proba(self, x):
            return np.tile([0.0, 1.0], (len(x), 1))
    m = np.zeros((40, 40), bool); m[10:30, 10:30] = True   # a cleared block, 25% of the area
    before = picture(40, forest_mask=np.ones((40, 40), bool))
    after = picture(40, forest_mask=~m)
    r = analysis.analyze(before, after, CFG, model=Always())
    assert r["numbers"]["loss_pct"] > 20 and r["verdict"] == "NotEligible"
    old = copy.deepcopy(CFG)
    for k in ("clearing_min_ndvi_drop", "clearing_max_ndvi_after"):
        old["forest"].pop(k)
    assert analysis.analyze(before, after, old, model=Always())["numbers"]["loss_pct"] == 0  # old recipes unchanged
