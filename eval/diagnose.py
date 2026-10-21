"""Look inside the evaluation areas: what do the pictures really say, pixel by pixel?

    cd verifier && python ../eval/diagnose.py

For every area it prints how many pixels change by how much, for two signals:
  NDVI  (greenness)              = (NIR - Red) / (NIR + Red)
  NDMI  (moisture in leaves/wood) = (NIR - SWIR1) / (NIR + SWIR1)
and how often the forest model still says "forest" in the newer picture.
This helps pick a clearing rule that separates cut land from healthy forest.
Writes eval/diagnose.txt. Nothing is saved as a check and nothing goes on-chain.
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "verifier"))
from groveproof import analysis, pipeline, satellite  # noqa: E402
from groveproof.model import load_model  # noqa: E402
from groveproof.settings import config  # noqa: E402

cfg = config()
model, _ = load_model()
areas = json.loads((ROOT / "eval" / "areas.geojson").read_text())["features"]
lines = []


def out(s=""):
    print(s, flush=True)
    lines.append(s)


def pct(mask, cond):
    n = mask.sum()
    return round(100.0 * (cond & mask).sum() / n, 1) if n else 0.0


out("id         | NDVI before p50 / after p50 | NDMI before p50 / after p50 | "
    "NDVI drop>=.10 .15 .20 .30 | NDMI drop>=.10 .15 .20 .30 | model forest after % | brighter red>=.02 %")
for f in areas:
    p = f["properties"]
    try:
        rec = pipeline.build_recipe(f["geometry"], tuple(p["before"]), tuple(p["after"]))
        cb, _ = satellite.load_composite(rec["boundary"], rec["scenes"]["before"], cfg["satellite"])
        ca, _ = satellite.load_composite(rec["boundary"], rec["scenes"]["after"], cfg["satellite"])
    except Exception as e:
        out(f"{p['id']:<10} ERROR {e}")
        continue
    m = cb.aoi & ca.aoi & cb.clear & ca.clear
    nb, na = analysis.ndvi(cb), analysis.ndvi(ca)
    mb, ma = analysis.ndmi(cb), analysis.ndmi(ca)
    dn, dm = np.nan_to_num(nb - na), np.nan_to_num(mb - ma)
    red = np.nan_to_num(ca.bands["B04"] - cb.bands["B04"])
    pa = analysis.forest_probability(ca, model, cfg["forest"]["ndvi_fallback_threshold"])
    q = lambda a: round(float(np.nanmedian(a[m])), 2) if m.any() else 0  # noqa: E731
    out(f"{p['id']:<10} | {q(nb):>5} / {q(na):<5}             | {q(mb):>5} / {q(ma):<5}             | "
        + " ".join(f"{pct(m, dn >= t):>4}" for t in (.10, .15, .20, .30)) + "      | "
        + " ".join(f"{pct(m, dm >= t):>4}" for t in (.10, .15, .20, .30)) + "      | "
        + f"{pct(m, np.nan_to_num(pa) >= 0.5):>6}              | {pct(m, red >= .02):>5}")

(ROOT / "eval" / "diagnose.txt").write_text("\n".join(lines) + "\n")
print("\nSaved eval/diagnose.txt")
