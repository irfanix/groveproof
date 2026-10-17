"""Loads the trained forest model (a Random Forest classifier).

The model is trained by scripts/train_model.py on ESA WorldCover labels from
training areas that are kept separate from the evaluation areas. Its file
hash goes into the recipe, so a re-run must use exactly the same model.
"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache

from .settings import MODEL_META_PATH, MODEL_PATH


def file_sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@lru_cache
def load_model():
    """Returns (model, info). model is None if no trained model is present (NDVI rule is used)."""
    if not MODEL_PATH.exists():
        return None, {"name": "ndvi_rule", "version": "ndvi-rule-1", "sha256": None}
    import joblib
    model = joblib.load(MODEL_PATH)
    meta = json.loads(MODEL_META_PATH.read_text()) if MODEL_META_PATH.exists() else {}
    info = {
        "name": "random_forest",
        "version": meta.get("version", "rf-unknown"),
        "sha256": file_sha256(MODEL_PATH),
        "holdout_accuracy": meta.get("holdout_accuracy"),
    }
    return model, info
