"""Turn the points you picked on Global Forest Watch into evaluation areas.

    cd verifier && python ../eval/make_areas.py

Reads eval/points.txt, one point per line, written exactly like this:

    17.4523, 81.6012, loss 2025      <- centre of a pink tree-loss patch, and the loss year
    18.9876, 82.1111, stable         <- centre of a healthy forest with no pink nearby

Lines starting with # are ignored. Each loss point becomes a square of about 440 m, each stable point about 700 m.
Dates: the same green-season months (November to January) in both years.
  loss YEAR : before = Nov (YEAR-1) to Jan YEAR,  after = Nov YEAR to Jan (YEAR+1)
  stable    : before = Nov 2024 to Jan 2025,      after = Nov 2025 to Jan 2026
Writes eval/areas.geojson (the old file is replaced).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HALF_STABLE = 0.0032  # degrees: stable squares about 700 m wide
HALF_LOSS = 0.002     # loss squares about 440 m wide, centred on the pink patch so the loss is not diluted

areas = []
n_loss = n_stable = 0
for i, raw in enumerate((ROOT / "eval" / "points.txt").read_text(encoding="utf-8").splitlines(), 1):
    line = raw.split("#", 1)[0].strip()
    line = re.sub(r"^\s*lat\s*,\s*lon\s*:\s*", "", line, flags=re.I)  # copied straight from the map
    if not line:
        continue
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,?\s*(loss\s+(20\d\d)|stable)\s*$", line, re.I)
    if not m:
        raise SystemExit(f"Line {i} is not in the right form: {raw!r}\n"
                         "Write it like:  17.4523, 81.6012, loss 2025   or   17.4523, 81.6012, stable")
    lat, lon = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise SystemExit(f"Line {i}: {lat}, {lon} is not a valid place (latitude first, then longitude)")
    if m.group(4):
        y = int(m.group(4))
        n_loss += 1
        props = {"id": f"loss-{n_loss:02d}", "truth": "loss", "loss_year": y,
                 "before": [f"{y - 1}-11-01", f"{y}-01-31"], "after": [f"{y}-11-01", f"{y + 1}-01-31"],
                 "source": f"Global Forest Watch tree cover loss {y}, picked by hand"}
    else:
        n_stable += 1
        props = {"id": f"stable-{n_stable:02d}", "truth": "stable",
                 "before": ["2024-11-01", "2025-01-31"], "after": ["2025-11-01", "2026-01-31"],
                 "source": "Global Forest Watch: dense tree cover, no loss nearby, picked by hand"}
    props["point"] = [lat, lon]
    HALF = HALF_LOSS if props["truth"] == "loss" else HALF_STABLE
    ring = [[lon - HALF, lat - HALF], [lon + HALF, lat - HALF], [lon + HALF, lat + HALF],
            [lon - HALF, lat + HALF], [lon - HALF, lat - HALF]]
    areas.append({"type": "Feature", "properties": props,
                  "geometry": {"type": "Polygon", "coordinates": [[[round(x, 5), round(y, 5)] for x, y in ring]]}})

# An evaluation area must never touch the land the forest model was trained on.
train = json.loads((ROOT / "verifier" / "scripts" / "training_areas.json").read_text())["areas"]
def box(g):
    xs = [p[0] for p in g["coordinates"][0]]; ys = [p[1] for p in g["coordinates"][0]]
    return min(xs), min(ys), max(xs), max(ys)
for a in areas:
    ax0, ay0, ax1, ay1 = box(a["geometry"])
    for t in train:
        tx0, ty0, tx1, ty1 = box(t["geometry"])
        if ax0 < tx1 and tx0 < ax1 and ay0 < ty1 and ty0 < ay1:
            raise SystemExit(f"{a['properties']['id']} touches the training area {t['name']}. Move the point.")

out = {"type": "FeatureCollection",
       "note": "Evaluation areas, never used for training. Made by eval/make_areas.py from eval/points.txt.",
       "features": areas}
(ROOT / "eval" / "areas.geojson").write_text(json.dumps(out, indent=2))
print(f"Made {len(areas)} areas: {n_loss} with tree loss, {n_stable} stable. Saved eval/areas.geojson")
