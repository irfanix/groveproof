"""Run a live check for every sample forest and save the result as the cached demo result.

    python scripts/cache_samples.py            (all samples with a boundary)
    python scripts/cache_samples.py nallamala-healthy

The website shows cached results labelled "cached result, computed on <date>",
so the demo works even if the satellite service is slow during judging.
"""
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from groveproof import pipeline  # noqa: E402
from groveproof.settings import SAMPLES_DIR  # noqa: E402

path = SAMPLES_DIR / "samples.json"
data = json.loads(path.read_text())
only = set(sys.argv[1:])

for s in data["samples"]:
    if not s.get("boundary") or (only and s["id"] not in only):
        continue
    if s["expected"] == "AlreadyClaimed":
        print(f"- {s['id']}: skipped (this verdict comes live from the contract)")
        continue
    print(f"- {s['id']}: checking ...", flush=True)
    try:
        payload = pipeline.check(s["boundary"], tuple(s["before"]), tuple(s["after"]), s.get("zone"))
    except Exception as e:
        print(f"  failed: {e}")
        continue
    s["cached_check_id"] = payload["check_id"]
    dest = SAMPLES_DIR / "cache" / payload["check_id"]
    shutil.copytree(pipeline.DATA_DIR / "checks" / payload["check_id"], dest, dirs_exist_ok=True)
    r = payload["result"]
    mark = "OK" if r["verdict"] == s["expected"] else "DIFFERENT FROM EXPECTED, please look at the area again"
    print(f"  {r['verdict']} ({mark}); forest {r['numbers']['forest_after_ha']} ha, loss {r['numbers']['loss_pct']}%, "
          f"clear {r['numbers']['clear_pct']}%, credits {r['credits']['credits']}")

path.write_text(json.dumps(data, indent=2))
print("Saved samples.json")
