"""Measure every evaluation area pixel by pixel and save the numbers to one file.

    cd verifier && python ../eval/collect.py

Writes eval/measurements.json (send this file for analysis). About 5 to 10 minutes.
Nothing is saved as a check and nothing goes on-chain.
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "verifier"))
from groveproof import diagnose  # noqa: E402

areas = json.loads((ROOT / "eval" / "areas.geojson").read_text())["features"]
out = {}
for f in areas:
    p = f["properties"]
    t = time.time()
    try:
        m = diagnose.measure(f["geometry"], tuple(p["before"]), tuple(p["after"]))
        m["truth"] = p["truth"]
        out[p["id"]] = m
        print(f"{p['id']:<10} {p['truth']:<6} forest before {m['forest_before_px']} px, "
              f"model forest after {m['forest_after_model_px']} px  ({time.time() - t:.0f} s)", flush=True)
    except Exception as e:
        out[p["id"]] = {"truth": p["truth"], "error": str(e)}
        print(f"{p['id']:<10} ERROR {e}", flush=True)
(ROOT / "eval" / "measurements.json").write_text(json.dumps(out))
print("\nSaved eval/measurements.json  <- send this file")
