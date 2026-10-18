"""Check every sample forest for real and fix the ones that do not show what they promise.

    python scripts/verify_samples.py                     (every sample)
    python scripts/verify_samples.py nallamala-overlap   (only the samples named)

What it does, for each sample in samples/samples.json:

1. Land register. Reads the blockchain. A sample that should be a fresh forest must not contain
   land that is already a project (for example GP-1), so it is moved one square to the side.
   The "Overlapping claim" sample is placed on top of the first real project, so it is always refused.
2. Season. Dry deciduous forests in Andhra Pradesh drop their leaves from about February to May,
   and fires are common in March. Bare trees look like tree loss to a satellite, so comparisons
   are made in the green season. The script tries these windows, the same months in both years:
       Nov to Jan, Oct to Dec, Dec to Feb
   and keeps the first one where the forest is clearly seen and the result matches the sample.
3. Saves the final result as the sample's saved result (opens instantly on the website).
4. Writes samples/sample_report.md with every attempt, including the ones that did not match,
   so anyone can see exactly how each sample was chosen.

Nothing is written to the blockchain.
"""
from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import h3  # noqa: E402

from groveproof import chain, pipeline  # noqa: E402
from groveproof.cells import boundary_to_cells, cells_to_strings  # noqa: E402
from groveproof.settings import SAMPLES_DIR, config  # noqa: E402

GREEN_SEASONS = [  # (label, before, after): same months, one year apart
    ("Nov to Jan", ("2024-11-01", "2025-01-31"), ("2025-11-01", "2026-01-31")),
    ("Oct to Dec", ("2024-10-01", "2024-12-31"), ("2025-10-01", "2025-12-31")),
    ("Dec to Feb", ("2024-12-01", "2025-02-28"), ("2025-12-01", "2026-02-28")),
]
MONSOON_SEASONS = [
    ("early July", ("2025-07-01", "2025-07-20"), ("2026-07-01", "2026-07-20")),
    ("mid July", ("2025-07-10", "2025-07-25"), ("2026-07-10", "2026-07-25")),
]
STEP = 0.016  # degrees, a little more than one sample square, so a moved square never touches the old one
MOVES = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1), (2, 0), (-2, 0)]

report: list[str] = []


def log(text: str = "") -> None:
    print(text, flush=True)
    report.append(text)


def square(lon: float, lat: float, w: float = 0.015, h: float = 0.014) -> dict:
    ring = [[lon, lat], [lon + w, lat], [lon + w, lat + h], [lon, lat + h], [lon, lat]]
    return {"type": "Polygon", "coordinates": [[[round(x, 5), round(y, 5)] for x, y in ring]]}


def corner(b: dict) -> tuple[float, float, float, float]:
    xs = [p[0] for p in b["coordinates"][0]]
    ys = [p[1] for p in b["coordinates"][0]]
    return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)


def cells_of(b: dict) -> list[str]:
    return cells_to_strings(boundary_to_cells(b, config()["h3_resolution"]))


def claimed(b: dict) -> dict:
    return chain.claimed_cells(cells_of(b)) if chain.configured() else {}


def free_square(b: dict) -> tuple[dict, str]:
    """Same square, or the nearest one beside it that holds no registered land."""
    if not claimed(b):
        return b, "unchanged"
    lon, lat, w, h = corner(b)
    for dx, dy in MOVES:
        nb = square(lon + dx * STEP, lat + dy * STEP, w, h)
        if not claimed(nb):
            return nb, f"moved {dx * STEP:+.3f} lon, {dy * STEP:+.3f} lat (old square holds registered land)"
    raise RuntimeError("no free square nearby")


def run(b: dict, before, after, zone):
    t = time.time()
    p = pipeline.check(b, tuple(before), tuple(after), zone)
    r = p["result"]
    n = r.get("numbers", {})
    line = (f"{r['verdict']}: forest {n.get('forest_after_ha')} ha, loss {n.get('loss_pct')}%, "
            f"clear {n.get('clear_pct')}%, credits {r['credits']['credits']} ({time.time() - t:.0f} s)")
    return p, line


def try_seasons(s: dict, b: dict, seasons) -> dict | None:
    for label, before, after in seasons:
        try:
            p, line = run(b, before, after, s.get("zone"))
        except Exception as e:  # no pictures, network trouble ...
            log(f"    {label}: could not finish ({e})")
            continue
        ok = p["result"]["verdict"] == s["expected"]
        log(f"    {label}: {line}{'  <- matches' if ok else ''}")
        if ok:
            s["before"], s["after"], s["season"] = list(before), list(after), label
            return p
    return None


def save_cache(s: dict, p: dict) -> None:
    s["cached_check_id"] = p["check_id"]
    shutil.copytree(pipeline.check_folder(p["check_id"]), SAMPLES_DIR / "cache" / p["check_id"], dirs_exist_ok=True)


def main() -> int:
    path = SAMPLES_DIR / "samples.json"
    data = json.loads(path.read_text())
    by_id = {s["id"]: s for s in data["samples"]}
    problems = []
    only = set(sys.argv[1:])
    want = lambda sid: not only or sid in only  # noqa: E731

    log(f"# Sample forest check, {time.strftime('%Y-%m-%d %H:%M')}")
    log()
    log(f"Blockchain connected: {'yes' if chain.configured() else 'NO (land register not checked)'}")
    log()

    # 1. Fresh-forest samples: make sure their land is free, then find the green season.
    for sid in ("nallamala-healthy", "seshachalam", "papikonda"):
        s = by_id.get(sid)
        if not want(sid) or not s or not s.get("boundary"):
            continue
        log(f"## {s['name']} (should be {s['expected']})")
        s["cached_check_id"] = None
        found = None
        b, how = free_square(s["boundary"])
        log(f"  land: {how}")
        candidates = [b]
        lon, lat, w, h = corner(b)
        candidates += [square(lon + dx * STEP, lat + dy * STEP, w, h) for dx, dy in MOVES[:4]]
        for i, cb in enumerate(candidates):
            if i and claimed(cb):
                continue
            if i:
                log(f"  trying the square beside it ({corner(cb)[0]:.3f}, {corner(cb)[1]:.3f})")
            found = try_seasons(s, cb, GREEN_SEASONS)
            if found:
                s["boundary"] = cb
                break
        if found:
            save_cache(s, found)
            log(f"  -> fixed: {s['season']}, saved result {found['check_id']}")
        else:
            problems.append(s["name"])
            log("  -> NOT FIXED. Leave this sample out of the demo for now.")
        log()

    # 2. Monsoon sample: the same land as the Nallamala sample, cloudy July dates.
    m, healthy = by_id.get("nallamala-monsoon"), by_id.get("nallamala-healthy")
    if m and healthy and want("nallamala-monsoon"):
        log(f"## {m['name']} (should be {m['expected']})")
        m["boundary"], m["cached_check_id"] = healthy["boundary"], None
        found = try_seasons(m, m["boundary"], MONSOON_SEASONS)
        if found:
            save_cache(m, found)
            log(f"  -> fixed: {m['season']}, saved result {found['check_id']}")
        else:
            problems.append(m["name"])
            log("  -> NOT FIXED.")
        log()

    # 3. Overlapping claim: placed over the first real project, so the contract always refuses it.
    o = by_id.get("nallamala-overlap")
    if o and chain.configured() and want("nallamala-overlap"):
        log(f"## {o['name']} (should be {o['expected']})")
        try:
            cell = chain.project_cells(1)[0]
            lat, lon = h3.cell_to_latlng(h3.int_to_str(int(cell)))
            nb = square(lon - 0.004, lat - 0.004)
            hit = claimed(nb)
            o["boundary"], o["cached_check_id"] = nb, None
            o["description"] = ("This square includes land already registered as project GP-1. "
                                "The contract refuses it: the same land cannot be counted twice.")
            log(f"  placed over GP-1: {len(hit)} of {len(cells_of(nb))} map cells already belong to GP-1"
                f"{'  <- matches' if hit else '  (PROBLEM: no overlap found)'}")
            if not hit:
                problems.append(o["name"])
        except Exception as e:
            problems.append(o["name"])
            log(f"  could not read GP-1 from the blockchain ({e})")
        log()

    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    log("## Summary")
    log("All samples now show what they promise." if not problems else f"Still wrong: {', '.join(problems)}")
    rp = SAMPLES_DIR / "sample_report.md"
    earlier = rp.read_text() + "\n" if only and rp.exists() else ""   # a partial run adds to the full report
    rp.write_text(earlier + "\n".join(report) + "\n")
    print("\nSaved samples.json and samples/sample_report.md")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
