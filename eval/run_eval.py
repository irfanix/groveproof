"""Honest evaluation of GroveProof on areas never used for training.

    cd verifier && python ../eval/run_eval.py

For each area in eval/areas.geojson it runs a live satellite check and compares
the verdict with the truth (loss or stable). It prints a table for the README and
saves eval/results.json.

Most important number: cleared forests marked Verified (goal: 0).
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "verifier"))
from groveproof import pipeline  # noqa: E402
from groveproof.hashing import keccak_hex  # noqa: E402
from groveproof.rerun import rerun  # noqa: E402

areas = json.loads((ROOT / "eval" / "areas.geojson").read_text())["features"]
rows = []
for f in areas:
    p = f["properties"]
    t = time.perf_counter()
    try:
        payload = pipeline.check(f["geometry"], tuple(p["before"]), tuple(p["after"]))
    except Exception as e:
        rows.append({"id": p["id"], "truth": p["truth"], "verdict": "ERROR", "error": str(e)})
        print(f"{p['id']:<14} ERROR {e}")
        continue
    secs = round(time.perf_counter() - t, 1)
    r = payload["result"]
    # reproducibility: re-run from the saved recipe and compare hashes
    folder = pipeline.check_folder(payload["check_id"])
    rec = json.loads((folder / "recipe.json").read_text())
    same = rerun(rec, r)["same"]
    rows.append({"id": p["id"], "truth": p["truth"], "verdict": r["verdict"],
                 "loss_pct": r["numbers"]["loss_pct"], "clear_pct": r["numbers"]["clear_pct"],
                 "forest_ha": r["numbers"]["forest_after_ha"], "seconds": secs, "rerun_same": same})
    print(f"{p['id']:<14} truth={p['truth']:<7} verdict={r['verdict']:<13} loss={r['numbers']['loss_pct']}% "
          f"clear={r['numbers']['clear_pct']}% {secs}s rerun_same={same}")

ok = [r for r in rows if r["verdict"] not in ("ERROR", "CantCheckYet")]
loss = [r for r in ok if r["truth"] == "loss"]
stable = [r for r in ok if r["truth"] == "stable"]
summary = {
    "areas": len(rows),
    "checked": len(ok),
    "cant_check_yet": sum(r["verdict"] == "CantCheckYet" for r in rows),
    "errors": sum(r["verdict"] == "ERROR" for r in rows),
    "cleared_marked_verified": sum(r["verdict"] == "Verified" for r in loss),
    "cleared_caught": sum(r["verdict"] in ("NotEligible", "NeedsReview") for r in loss),
    "cleared_total": len(loss),
    "stable_verified": sum(r["verdict"] == "Verified" for r in stable),
    "stable_wrongly_not_eligible": sum(r["verdict"] == "NotEligible" for r in stable),
    "stable_total": len(stable),
    "rerun_same": sum(bool(r.get("rerun_same")) for r in ok),
    "avg_seconds": round(sum(r["seconds"] for r in ok) / max(len(ok), 1), 1),
}
(ROOT / "eval" / "results.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=2))

print("\n| Measure | Result |\n|---|---|")
print(f"| Cleared forests marked Verified (goal 0) | {summary['cleared_marked_verified']} of {summary['cleared_total']} |")
print(f"| Cleared forests caught (Not eligible or Needs review) | {summary['cleared_caught']} of {summary['cleared_total']} |")
print(f"| Stable forests Verified | {summary['stable_verified']} of {summary['stable_total']} |")
print(f"| Stable forests wrongly Not eligible | {summary['stable_wrongly_not_eligible']} of {summary['stable_total']} |")
print(f"| Too cloudy to check | {summary['cant_check_yet']} of {summary['areas']} |")
print(f"| Re-run gave the same hash | {summary['rerun_same']} of {summary['checked']} |")
print(f"| Average check time | {summary['avg_seconds']} s |")
