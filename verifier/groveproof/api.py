"""GroveProof verifier API (FastAPI).

Run:  uvicorn groveproof.api:app --reload --port 8000

Endpoints
  GET  /api/health                 status, model, whether the chain is connected
  GET  /api/samples                sample forests for the demo
  POST /api/check                  check a forest (sample id or drawn boundary)
  GET  /api/checks/{id}            a saved check
  GET  /api/checks/{id}/{file}     recipe.json, result.json, before.png, after.png, map.png
  GET  /api/checks/by-recipe/{h}   find a saved check from the recipe hash stored on-chain
  POST /api/record/{projectId}     verifier writes the verdict on-chain (after the owner registered)
  POST /api/recheck/{projectId}    new satellite check of a registered forest; freezes it on major loss
  POST /api/rerun/{id}             re-run a saved check and compare hashes
"""
from __future__ import annotations

import json
import threading
import shutil
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import assistant, chain, evidence, pipeline
from .cells import boundary_to_cells, cells_geojson, cells_to_strings
from .model import load_model
from .rerun import rerun
from .settings import SAMPLES_DIR, config

load_dotenv()

app = FastAPI(title="GroveProof verifier", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

FILES = {"recipe.json", "result.json", "before.png", "after.png", "map.png"}


def samples() -> list[dict]:
    return json.loads((SAMPLES_DIR / "samples.json").read_text())["samples"]


def sample(sample_id: str) -> dict:
    for s in samples():
        if s["id"] == sample_id:
            return s
    raise HTTPException(404, f"Unknown sample {sample_id}")


class CheckRequest(BaseModel):
    sample_id: str | None = None
    boundary: dict | None = None          # GeoJSON Polygon geometry
    before: list[str] | None = None       # ["2025-01-01", "2025-03-31"]
    after: list[str] | None = None
    zone: str | None = None
    live: bool = False                    # force a fresh satellite check for a sample


class RecheckRequest(BaseModel):
    after: list[str]
    before: list[str] | None = None
    check_id: str | None = None           # the earlier check of this forest (gives boundary and before dates)


@app.get("/api/health")
def health():
    _, info = load_model()
    return {"ok": True, "model": info, "chain": chain.configured(), "rules": config()["version"]}


@app.get("/api/samples")
def list_samples():
    out = []
    for s in samples():
        if not s.get("boundary"):
            continue
        s = dict(s)
        s["cached"] = bool(s.get("cached_check_id") and pipeline.load_check(s["cached_check_id"]))
        out.append(s)
    return {"samples": out}


@app.post("/api/check")
def check(req: CheckRequest):
    if req.sample_id:
        s = sample(req.sample_id)
        boundary, before, after = s["boundary"], s["before"], s["after"]
        zone = req.zone or s.get("zone")
    elif req.boundary:
        if not (req.before and req.after):
            raise HTTPException(400, "Please give before and after dates")
        boundary, before, after, zone = req.boundary, req.before, req.after, req.zone
    else:
        raise HTTPException(400, "Choose a sample forest or draw a boundary")

    cfg = config()
    try:
        cells = cells_to_strings(boundary_to_cells(boundary, cfg["h3_resolution"]))
    except ValueError as e:
        raise HTTPException(400, str(e))
    if len(cells) > cfg["max_cells"]:
        raise HTTPException(400, f"This area is too big ({len(cells)} map cells). The limit is {cfg['max_cells']} (about 30 km2).")

    # 1. "Already claimed": checked first, straight from the contract. No satellites needed.
    t = time.perf_counter()
    claimed = chain.claimed_cells(cells)
    if claimed:
        pid = sorted(set(claimed.values()))[0]
        return {
            "check_id": None,
            "result": {"verdict": "AlreadyClaimed",
                       "reason": f"{len(claimed)} of the {len(cells)} map cells already belong to project GP-{pid}. "
                                 "The same land cannot be counted twice.",
                       "numbers": {"cells": len(cells), "claimed_cells": len(claimed)},
                       "credits": {"credits": 0}},
            "claimed_by": pid,
            "claimed_cells": list(claimed),
            "cells": cells,
            "timings": [{"label": "Checking the land register on the blockchain",
                         "seconds": round(time.perf_counter() - t, 1)}],
            "explanation": {"text": f"Result: Already claimed. Part of this land is already registered as project GP-{pid}, "
                                    "so the contract will not let it be registered again.", "source": "template"},
        }

    # 2. Cached result for sample forests (keeps the demo reliable), unless a live check is asked for.
    if req.sample_id and not req.live and s.get("cached_check_id"):
        cached = pipeline.load_check(s["cached_check_id"])
        if cached:
            return {**cached, "cached": True}

    # 3. Live satellite check.
    try:
        payload = pipeline.check(boundary, tuple(before), tuple(after), zone)
        if req.sample_id and not (s.get("cached_check_id") and pipeline.load_check(s["cached_check_id"])):
            remember_sample_result(req.sample_id, payload["check_id"])   # next time this sample opens instantly
        return payload
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:  # network or data problems
        raise HTTPException(502, f"The satellite check could not finish: {e}")


_samples_lock = threading.Lock()


def remember_sample_result(sample_id: str, check_id: str) -> None:
    """Save a sample's first live result as its saved result (same as scripts/cache_samples.py does)."""
    try:
        with _samples_lock:
            path = SAMPLES_DIR / "samples.json"
            data = json.loads(path.read_text())
            for x in data["samples"]:
                if x["id"] == sample_id:
                    x["cached_check_id"] = check_id
            shutil.copytree(pipeline.check_folder(check_id), SAMPLES_DIR / "cache" / check_id, dirs_exist_ok=True)
            path.write_text(json.dumps(data, indent=2))
    except Exception:
        pass  # saving is a convenience; the check itself already succeeded


@app.get("/api/checks/by-recipe/{recipe_hash}")
def by_recipe(recipe_hash: str):
    cid = pipeline.find_check_by_recipe_hash(recipe_hash)
    if not cid:
        raise HTTPException(404, "No saved check with this recipe hash")
    return pipeline.load_check(cid)


@app.get("/api/checks/{check_id}")
def get_check(check_id: str):
    c = pipeline.load_check(check_id)
    if not c:
        raise HTTPException(404, "Check not found")
    return c


@app.get("/api/checks/{check_id}/{name}")
def get_check_file(check_id: str, name: str):
    if name not in FILES or not check_id.isalnum():
        raise HTTPException(404, "Not found")
    path = pipeline.check_folder(check_id) / name
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path)


@app.get("/api/cells/{check_id}")
def get_cells_geojson(check_id: str):
    c = pipeline.load_check(check_id)
    if not c:
        raise HTTPException(404, "Check not found")
    return cells_geojson([int(x) for x in c["cells"]])


@app.post("/api/record/{project_id}")
def record(project_id: int, check_id: str):
    """Write a saved check's verdict on-chain for a registered project.

    Safety: the project's cells on-chain must be exactly the cells of the check,
    so a verdict for one forest can never be attached to another piece of land.
    """
    if not chain.configured():
        raise HTTPException(503, "The blockchain is not connected (offline demo mode)")
    c = pipeline.load_check(check_id)
    if not c:
        raise HTTPException(404, "Check not found")
    if not chain.cells_match(project_id, c["cells"]):
        raise HTTPException(409, "This project's land does not match the checked land")
    r = c["result"]
    tx = chain.record_verification(project_id, r["verdict"], r["credits"]["credits"],
                                   c["recipe_hash"], c["result_hash"])
    return {"tx": tx, "verdict": r["verdict"], "max_credits": r["credits"]["credits"]}


@app.post("/api/recheck/{project_id}")
def recheck(project_id: int, req: RecheckRequest):
    """Living credits: check the same land again with newer pictures."""
    if req.check_id:
        old = pipeline.load_check(req.check_id)
        if not old:
            raise HTTPException(404, "Earlier check not found")
        recipe = json.loads((pipeline.check_folder(req.check_id) / "recipe.json").read_text())
        boundary, before = recipe["boundary"], req.before or recipe["windows"]["after"]
        zone = recipe["zone"]
    else:
        raise HTTPException(400, "Please give the id of the earlier check")
    try:
        payload = pipeline.check(boundary, tuple(before), tuple(req.after), zone)
    except Exception as e:
        raise HTTPException(502, f"The satellite re-check could not finish: {e}")
    bps = pipeline.loss_bps(payload["result"])
    payload["loss_bps"] = bps
    payload["will_freeze"] = bps >= 500
    if chain.configured():
        if not chain.cells_match(project_id, payload["cells"]):
            raise HTTPException(409, "This project's land does not match the checked land")
        payload["tx"] = chain.record_recheck(project_id, bps, payload["recipe_hash"], payload["result_hash"])
    return payload


@app.post("/api/rerun/{check_id}")
def rerun_check(check_id: str):
    folder = pipeline.check_folder(check_id)
    if not (folder / "recipe.json").exists():
        raise HTTPException(404, "Check not found")
    recipe = json.loads((folder / "recipe.json").read_text())
    saved = json.loads((folder / "result.json").read_text())
    t = time.perf_counter()
    try:
        out = rerun(recipe, saved)
    except Exception as e:
        raise HTTPException(502, f"Re-run could not finish: {e}")
    out["seconds"] = round(time.perf_counter() - t, 1)
    return out


# ------------------------------------------------------------------ evidence, review, assistant

def _check_for(check_id: str | None) -> dict | None:
    if not check_id:
        return None
    c = pipeline.load_check(check_id)
    if c and not c.get("boundary"):
        recipe = pipeline.check_folder(check_id) / "recipe.json"
        if recipe.exists():
            c["boundary"] = json.loads(recipe.read_text()).get("boundary")
    return c


class EvidenceFile(BaseModel):
    kind: str
    name: str
    mime: str = ""
    data_b64: str
    note: str = ""
    lat: float | None = None
    lon: float | None = None
    check_id: str | None = None


class Claim(BaseModel):
    category: str
    text: str
    value: float | None = None
    unit: str = ""


class Review(BaseModel):
    decision: str
    note: str = ""
    reviewer: str = ""
    supported_claims: list[str] = []


class Question(BaseModel):
    question: str
    facts: dict = {}


@app.get("/api/evidence/{project_id}")
def get_evidence(project_id: int, check_id: str | None = None):
    return evidence.summary(project_id, _check_for(check_id))


@app.post("/api/evidence/{project_id}")
def post_evidence(project_id: int, f: EvidenceFile):
    check = _check_for(f.check_id)
    try:
        return evidence.add_file(project_id, f.kind, f.name, f.mime, f.data_b64, f.note, f.lat, f.lon,
                                 (check or {}).get("boundary"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/evidence/{project_id}/file/{name}")
def get_evidence_file(project_id: int, name: str):
    p = evidence.file_path(project_id, name)
    if not p:
        raise HTTPException(404, "File not found")
    return FileResponse(p)


@app.post("/api/evidence/{project_id}/claims")
def post_claim(project_id: int, c: Claim):
    try:
        return evidence.add_claim(project_id, c.category, c.text, c.value, c.unit)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/evidence/{project_id}/review")
def post_review(project_id: int, r: Review):
    try:
        return evidence.add_review(project_id, r.decision, r.note, r.reviewer, r.supported_claims)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/review-queue")
def review_queue():
    out = []
    for pid in evidence.all_projects():
        s = evidence.summary(pid)
        out.append({"project_id": pid, "files": len(s["items"]), "claims": len(s["claims"]),
                    "flags": len(s["flags"]), "high_flags": sum(f["level"] == "high" for f in s["flags"]),
                    "review": s["review"]})
    return {"projects": out}


@app.post("/api/assistant")
def ask(q: Question):
    try:
        return assistant.answer(q.question, q.facts)
    except LookupError as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"The AI model did not answer: {e}")
