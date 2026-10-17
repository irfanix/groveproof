"""Train the forest / not-forest model (Random Forest) on Sentinel-2 pixels.

Labels come from ESA WorldCover 2021 (class 10 = tree cover), which is on
Microsoft Planetary Computer. Training areas are listed in
scripts/training_areas.json and must NOT overlap the evaluation areas in
eval/areas.geojson (the script checks this).

    python scripts/train_model.py

Writes models/forest_rf.joblib and models/forest_rf.json (version, accuracy, hash).
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shapely.geometry import shape  # noqa: E402

from groveproof import satellite  # noqa: E402
from groveproof.analysis import features  # noqa: E402
from groveproof.model import file_sha256  # noqa: E402
from groveproof.settings import config  # noqa: E402

PIXELS_PER_AREA = 4000
SEED = 42


def worldcover_labels(geometry, comp_shape, epsg, bounds):
    """ESA WorldCover classes resampled onto the same 10 m grid."""
    import odc.stac
    items = list(satellite._client().search(collections=["esa-worldcover"], intersects=geometry,
                                            datetime="2021-01-01/2021-12-31").items())
    if not items:
        raise RuntimeError("No WorldCover tile found")
    ds = odc.stac.load(items, bands=["map"], crs=f"EPSG:{epsg}", resolution=10, bbox=bounds,
                       resampling="nearest")
    lab = ds["map"].values[0]
    if lab.shape != comp_shape:
        raise RuntimeError(f"Grid mismatch {lab.shape} vs {comp_shape}")
    return lab


def main():
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score, classification_report
    import joblib

    cfg = config()
    areas = json.loads((ROOT / "scripts" / "training_areas.json").read_text())["areas"]
    eval_path = ROOT.parent / "eval" / "areas.geojson"
    eval_geoms = [shape(f["geometry"]) for f in json.loads(eval_path.read_text())["features"]] if eval_path.exists() else []

    rng = np.random.default_rng(SEED)
    X, y, groups = [], [], []
    for i, a in enumerate(areas):
        g = shape(a["geometry"])
        if any(g.intersects(e) for e in eval_geoms):
            raise SystemExit(f"Training area {a['name']} overlaps an evaluation area. Move it.")
        print(f"- {a['name']}", flush=True)
        ids = satellite.find_scenes(a["geometry"], tuple(a["window"]), cfg["satellite"])
        comp, _ = satellite.load_composite(a["geometry"], ids, cfg["satellite"])
        c = g.centroid
        epsg = satellite.utm_epsg(c.x, c.y)
        lab = worldcover_labels(a["geometry"], comp.aoi.shape, epsg, g.bounds)
        feats = features(comp)
        ok = comp.clear & np.isin(lab, [10, 20, 30, 40, 50, 60, 80, 90])
        idx = np.flatnonzero(ok)
        take = rng.choice(idx, size=min(PIXELS_PER_AREA, idx.size), replace=False)
        X.append(feats.reshape(-1, feats.shape[-1])[take])
        y.append((lab.reshape(-1)[take] == 10).astype(int))
        groups.append(np.full(take.size, i))

    X, y, groups = np.concatenate(X), np.concatenate(y), np.concatenate(groups)
    # Hold out whole areas (not random pixels) so the accuracy is honest.
    held = set(rng.choice(len(areas), size=max(1, len(areas) // 4), replace=False).tolist())
    test = np.isin(groups, list(held))
    model = RandomForestClassifier(n_estimators=150, max_depth=14, min_samples_leaf=5,
                                   n_jobs=-1, random_state=SEED, class_weight="balanced")
    model.fit(X[~test], y[~test])
    acc = accuracy_score(y[test], model.predict(X[test]))
    print(classification_report(y[test], model.predict(X[test]), target_names=["not forest", "forest"]))

    # Final model uses all training areas.
    model.fit(X, y)
    out = ROOT / "models"
    out.mkdir(exist_ok=True)
    joblib.dump(model, out / "forest_rf.joblib")
    meta = {
        "version": "rf-1.0",
        "features": ["B02", "B03", "B04", "B08", "B11", "B12", "NDVI", "NDMI"],
        "labels": "ESA WorldCover 2021, class 10 = forest",
        "training_areas": [a["name"] for a in areas],
        "held_out_areas": [areas[i]["name"] for i in sorted(held)],
        "holdout_accuracy": round(float(acc), 4),
        "pixels": int(len(y)),
        "sha256": file_sha256(out / "forest_rf.joblib"),
    }
    (out / "forest_rf.json").write_text(json.dumps(meta, indent=2))
    print(f"Saved model. Held-out accuracy: {acc:.3f}")


if __name__ == "__main__":
    main()
