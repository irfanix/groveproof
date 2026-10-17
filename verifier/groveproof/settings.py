"""Loads the checking rules (config.yaml) and carbon factors (factors.json).

Both files are part of the recipe: their hashes go into every check, so a
re-run can prove it used exactly the same rules.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import yaml

from .hashing import keccak_hex

PKG_DIR = Path(__file__).resolve().parent
ROOT_DIR = PKG_DIR.parent
CONFIG_PATH = PKG_DIR / "config.yaml"
FACTORS_PATH = PKG_DIR / "factors.json"
MODEL_PATH = ROOT_DIR / "models" / "forest_rf.joblib"
MODEL_META_PATH = ROOT_DIR / "models" / "forest_rf.json"
SAMPLES_DIR = ROOT_DIR / "samples"
DATA_DIR = ROOT_DIR / "data"


@lru_cache
def config() -> dict:
    return yaml.safe_load(CONFIG_PATH.read_text())


@lru_cache
def factors() -> dict:
    return json.loads(FACTORS_PATH.read_text())


def config_hash() -> str:
    return keccak_hex(config())


def factors_hash() -> str:
    return keccak_hex(factors())
