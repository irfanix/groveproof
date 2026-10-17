"""Runs a full check and saves its recipe and result.

recipe = everything needed to repeat the check exactly (boundary, scene ids,
         dates, rules, factors, model hash, code version)
result = the verdict and every number

keccak256(recipe) and keccak256(result) are written to the smart contract.
Anyone can run `python -m groveproof.rerun recipe.json` and compare.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image

from . import analysis, carbon, satellite
from .cells import boundary_to_cells, cells_to_strings
from .explain import explain
from .hashing import keccak_hex
from .model import load_model
from .settings import DATA_DIR, ROOT_DIR, SAMPLES_DIR, config, factors

RECIPE_VERSION = 1


def code_commit() -> str:
    if os.getenv("GIT_COMMIT"):
        return os.environ["GIT_COMMIT"]
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT_DIR,
                                       stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return "unknown"


class Timer:
    """Records how long each step takes, for the live progress display."""

    def __init__(self):
        self.steps: list[dict] = []

    def step(self, label: str):
        timer = self

        class _Ctx:
            def __enter__(self):
                self.t = time.perf_counter()

            def __exit__(self, *exc):
                timer.steps.append({"label": label, "seconds": round(time.perf_counter() - self.t, 1)})

        return _Ctx()


def build_recipe(boundary: dict, before: tuple[str, str], after: tuple[str, str],
                 zone: str | None = None, timer: Timer | None = None) -> dict:
    """Find the scenes and freeze every setting into a recipe."""
    cfg, fac = config(), factors()
    timer = timer or Timer()
    with timer.step("Finding satellite images"):
        scenes_before = satellite.find_scenes(boundary, before, cfg["satellite"])
        scenes_after = satellite.find_scenes(boundary, after, cfg["satellite"])
    _, model_info = load_model()
    return {
        "recipe_version": RECIPE_VERSION,
        "boundary": boundary,
        "h3_resolution": cfg["h3_resolution"],
        "cells": cells_to_strings(boundary_to_cells(boundary, cfg["h3_resolution"])),
        "windows": {"before": list(before), "after": list(after)},
        "scenes": {"before": scenes_before, "after": scenes_after},
        "zone": zone or fac["default_zone"],
        "config": cfg,
        "factors": fac,
        "model": {k: model_info[k] for k in ("name", "version", "sha256")},
        "code_commit": code_commit(),
    }


def run_recipe(recipe: dict, loader=None, model=None, timer: Timer | None = None) -> tuple[dict, dict]:
    """Run a recipe. Returns (result, extras). result is deterministic and hashed; extras holds
    pictures and timings, which are not part of the hash.

    `loader` and `model` can be swapped for tests (no network needed).
    """
    cfg, fac = recipe["config"], recipe["factors"]
    timer = timer or Timer()
    loader = loader or (lambda b, ids: satellite.load_composite(b, ids, cfg["satellite"]))
    if model is None and recipe["model"]["name"] == "random_forest":
        model, info = load_model()
        if info["sha256"] != recipe["model"]["sha256"]:
            raise RuntimeError("This recipe needs a different forest model file (hash does not match)")

    with timer.step("Removing clouds (before)"):
        comp_before, rgb_before = loader(recipe["boundary"], recipe["scenes"]["before"])
    with timer.step("Removing clouds (after)"):
        comp_after, rgb_after = loader(recipe["boundary"], recipe["scenes"]["after"])
    with timer.step("Mapping forest and comparing"):
        a = analysis.analyze(comp_before, comp_after, cfg, model)
    with timer.step("Calculating credits"):
        credits = carbon.compute_credits(a["verdict"], a["numbers"], cfg["credits"], fac, recipe["zone"])

    result = {
        "verdict": a["verdict"],
        "reason": a["reason"],
        "numbers": a["numbers"],
        "credits": credits,
        "recipe_hash": keccak_hex(recipe),
    }
    extras = {"rgb_before": rgb_before, "rgb_after": rgb_after, "masks": a["masks"], "timer": timer}
    return result, extras


def loss_bps(result: dict) -> int:
    """Tree loss in basis points (5% = 500) for the contract's re-check."""
    return int(round(result["numbers"]["loss_pct"] * 100))


def map_image(masks: dict) -> np.ndarray:
    """Forest map picture: green = forest, red = tree loss, grey = cloudy, clear = outside."""
    h, w = masks["aoi"].shape
    img = np.zeros((h, w, 4), dtype="uint8")
    img[masks["aoi"]] = (180, 180, 180, 255)                      # cloudy / unseen inside the boundary
    img[masks["clear"]] = (232, 226, 205, 255)                    # clear, not forest
    img[masks["forest_after"]] = (22, 101, 52, 255)               # forest now
    img[masks["loss"]] = (180, 35, 58, 255)                       # tree loss
    return img


def save_check(result: dict, recipe: dict, extras: dict, explanation: dict) -> dict:
    """Write recipe.json, result.json and pictures to data/checks/<id>/ and return the API payload."""
    check_id = result["recipe_hash"][2:18]
    folder = DATA_DIR / "checks" / check_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "recipe.json").write_text(json.dumps(recipe, indent=2))
    (folder / "result.json").write_text(json.dumps(result, indent=2))
    Image.fromarray(extras["rgb_before"]).save(folder / "before.png")
    Image.fromarray(extras["rgb_after"]).save(folder / "after.png")
    Image.fromarray(map_image(extras["masks"]), "RGBA").save(folder / "map.png")
    payload = {
        "check_id": check_id,
        "result": result,
        "result_hash": keccak_hex(result),
        "recipe_hash": result["recipe_hash"],
        "explanation": explanation,
        "timings": extras["timer"].steps,
        "cells": recipe["cells"],
        "windows": recipe["windows"],
        "scenes": recipe["scenes"],
        "model": recipe["model"],
        "checked_at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
    }
    (folder / "payload.json").write_text(json.dumps(payload, indent=2))
    return payload


def check(boundary: dict, before: tuple[str, str], after: tuple[str, str], zone: str | None = None) -> dict:
    """Full live check: find scenes, run, explain, save."""
    timer = Timer()
    recipe = build_recipe(boundary, before, after, zone, timer)
    result, extras = run_recipe(recipe, timer=timer)
    with timer.step("Writing the explanation"):
        explanation = explain(result)
    return save_check(result, recipe, extras, explanation)


def check_folder(check_id: str) -> Path:
    """Saved checks live in data/checks; sample checks are also kept in samples/cache (part of the repo,
    so they survive a server restart on free hosting)."""
    for base in (DATA_DIR / "checks", SAMPLES_DIR / "cache"):
        if (base / check_id).exists():
            return base / check_id
    return DATA_DIR / "checks" / check_id


def load_check(check_id: str) -> dict | None:
    f = check_folder(check_id) / "payload.json"
    return json.loads(f.read_text()) if f.exists() else None


def find_check_by_recipe_hash(recipe_hash: str) -> str | None:
    cid = recipe_hash.lower().removeprefix("0x")[:16]
    return cid if (check_folder(cid) / "recipe.json").exists() else None
