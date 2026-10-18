"""Evidence from project owners, automatic warning flags, and human review.

Owners can add photos, reports, monitoring data and location files to a project.
Every file is fingerprinted (SHA-256) and checked by simple, explainable rules.
The rules only FLAG things for a person to look at. They never decide that a
project is genuine; an independent reviewer does that, and the satellites and
the smart contract still decide the credits.

Storage is plain files in data/evidence/<project id>/ so it is easy to inspect.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import threading
import time
import uuid
from pathlib import Path

from .settings import DATA_DIR

KINDS = {"photo": "Photo", "report": "Report", "monitoring": "Monitoring data", "location": "Location file"}
CLAIM_CATEGORIES = {
    "community": "Community benefit",
    "jobs": "Local jobs",
    "biodiversity": "Biodiversity",
    "water": "Water and soil",
    "other": "Other benefit",
}
MAX_BYTES = 5 * 1024 * 1024
EDIT_APPS = re.compile(r"photoshop|gimp|snapseed|picsart|canva|lightroom|facetune|remini", re.I)
_lock = threading.Lock()


def _root() -> Path:
    return DATA_DIR / "evidence"


def _folder(project_id: int) -> Path:
    return _root() / str(int(project_id))


def _index_path(project_id: int) -> Path:
    return _folder(project_id) / "index.json"


def load(project_id: int) -> dict:
    p = _index_path(project_id)
    if p.exists():
        return json.loads(p.read_text())
    return {"project_id": int(project_id), "items": [], "claims": [], "reviews": []}


def _save(project_id: int, data: dict) -> None:
    f = _folder(project_id)
    f.mkdir(parents=True, exist_ok=True)
    _index_path(project_id).write_text(json.dumps(data, indent=2))


def all_projects() -> list[int]:
    if not _root().exists():
        return []
    return sorted(int(p.name) for p in _root().iterdir() if p.is_dir() and p.name.isdigit())


# ------------------------------------------------------------------ photo details (EXIF)

def _gps_to_deg(values, ref) -> float | None:
    try:
        d, m, s = (float(v) for v in values)
        deg = d + m / 60 + s / 3600
        return -deg if ref in ("S", "W") else deg
    except Exception:
        return None


def photo_details(raw: bytes) -> dict:
    """Size, date taken, GPS position and editing software, when the photo has them."""
    from PIL import Image
    out: dict = {}
    try:
        img = Image.open(io.BytesIO(raw))
        out["width"], out["height"] = img.size
        exif = img.getexif()
        if exif:
            software = exif.get(305)
            if software:
                out["software"] = str(software)
            taken = exif.get_ifd(0x8769).get(36867) or exif.get(306)
            if taken:
                out["taken"] = str(taken)
            gps = exif.get_ifd(0x8825)
            if gps and 2 in gps and 4 in gps:
                lat = _gps_to_deg(gps[2], gps.get(1, "N"))
                lon = _gps_to_deg(gps[4], gps.get(3, "E"))
                if lat is not None and lon is not None:
                    out["lat"], out["lon"] = round(lat, 6), round(lon, 6)
    except Exception:
        out["unreadable"] = True
    return out


def _parse_exif_date(text: str) -> float | None:
    try:
        return time.mktime(time.strptime(text[:19], "%Y:%m:%d %H:%M:%S"))
    except Exception:
        return None


# ------------------------------------------------------------------ flags

def _km_outside(boundary: dict, lat: float, lon: float) -> float:
    from shapely.geometry import Point, shape
    poly = shape(boundary)
    pt = Point(lon, lat)
    if poly.contains(pt):
        return 0.0
    return poly.distance(pt) * 111.0  # degrees to km, close enough for a warning


def flags_for(item: dict, project_id: int, boundary: dict | None) -> list[dict]:
    """Plain-language warnings for one file. Each flag says what was seen and why a person should look."""
    flags = []
    # 1. The exact same file is used for another project
    for other in all_projects():
        if other == int(project_id):
            continue
        if any(x["sha256"] == item["sha256"] for x in load(other)["items"]):
            flags.append({"code": "duplicate", "level": "high",
                          "text": f"The exact same file was also added to project GP-{other}. One piece of evidence should not support two projects."})
    if item["kind"] == "photo":
        d = item.get("details", {})
        if not item["mime"].startswith("image/"):
            flags.append({"code": "not_image", "level": "medium", "text": "Added as a photo, but the file is not an image."})
        if d.get("unreadable"):
            flags.append({"code": "unreadable", "level": "medium", "text": "The photo could not be opened."})
        lat, lon = d.get("lat", item.get("lat")), d.get("lon", item.get("lon"))
        if lat is None or lon is None:
            flags.append({"code": "no_location", "level": "low",
                          "text": "The photo has no GPS position, so we cannot tell where it was taken."})
        elif boundary:
            km = _km_outside(boundary, float(lat), float(lon))
            if km > 2:
                flags.append({"code": "far_away", "level": "high",
                              "text": f"The photo was taken about {km:.0f} km outside the forest boundary."})
        taken = _parse_exif_date(d.get("taken", "")) if d.get("taken") else None
        if taken:
            age_days = (time.time() - taken) / 86400
            if age_days < -2:
                flags.append({"code": "future_date", "level": "medium", "text": "The photo's date is in the future. The camera clock may be wrong."})
            elif age_days > 540:
                flags.append({"code": "old_photo", "level": "medium",
                              "text": f"The photo was taken about {age_days / 365:.1f} years ago. It may not show the forest today."})
        if d.get("software") and EDIT_APPS.search(d["software"]):
            flags.append({"code": "edited", "level": "medium",
                          "text": f"The photo was saved by editing software ({d['software']}). Ask for the original."})
        if d.get("width") and min(d["width"], d.get("height", 0)) < 400:
            flags.append({"code": "low_quality", "level": "low", "text": "The photo is very small, so details are hard to see."})
    if item["size"] < 200:
        flags.append({"code": "empty", "level": "medium", "text": "The file is almost empty."})
    return flags


def satellite_flags(check: dict | None, claims: list[dict]) -> list[dict]:
    """Warnings that come from comparing what owners say with what the satellites measured."""
    if not check:
        return []
    n = check.get("result", {}).get("numbers", {})
    out = []
    loss = n.get("loss_pct")
    if loss is not None and loss >= 2:
        out.append({"code": "satellite_loss", "level": "high",
                    "text": f"Satellites measured {loss}% tree loss in this forest. Look closely at claims that it is healthy."})
    if n.get("clear_pct") is not None and n["clear_pct"] < 80:
        out.append({"code": "cloudy", "level": "low",
                    "text": f"Only {n['clear_pct']}% of the land was seen clearly by satellites. Ground photos matter more here."})
    if any(c["category"] == "biodiversity" for c in claims) and n.get("forest_cover_after_pct", 100) < 40:
        out.append({"code": "biodiversity_low_cover", "level": "medium",
                    "text": "A biodiversity claim was made, but less than 40% of the area is forest."})
    return out


# ------------------------------------------------------------------ actions

def add_file(project_id: int, kind: str, name: str, mime: str, data_b64: str, note: str = "",
             lat: float | None = None, lon: float | None = None, boundary: dict | None = None) -> dict:
    if kind not in KINDS:
        raise ValueError(f"Kind must be one of: {', '.join(KINDS)}")
    try:
        raw = base64.b64decode(data_b64.split(",", 1)[-1], validate=False)
    except Exception:
        raise ValueError("The file could not be read")
    if len(raw) > MAX_BYTES:
        raise ValueError("Files can be at most 5 MB")
    sha = hashlib.sha256(raw).hexdigest()
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name)[-80:] or "file"
    item = {
        "id": uuid.uuid4().hex[:10],
        "kind": kind,
        "name": name[:120],
        "file": f"{sha[:12]}_{safe}",
        "mime": mime or "application/octet-stream",
        "size": len(raw),
        "sha256": sha,
        "note": note[:500],
        "added_at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
    }
    if lat is not None and lon is not None:
        item["lat"], item["lon"] = float(lat), float(lon)
    if kind == "photo" or item["mime"].startswith("image/"):
        item["details"] = photo_details(raw)
    with _lock:
        data = load(project_id)
        if any(x["sha256"] == sha for x in data["items"]):
            raise ValueError("This exact file was already added to this project")
        item["flags"] = flags_for(item, project_id, boundary)
        _folder(project_id).mkdir(parents=True, exist_ok=True)
        (_folder(project_id) / item["file"]).write_bytes(raw)
        data["items"].append(item)
        _save(project_id, data)
    return item


def add_claim(project_id: int, category: str, text: str, value: float | None = None, unit: str = "") -> dict:
    if category not in CLAIM_CATEGORIES:
        raise ValueError(f"Category must be one of: {', '.join(CLAIM_CATEGORIES)}")
    if not text.strip():
        raise ValueError("Please describe the benefit")
    claim = {"id": uuid.uuid4().hex[:10], "category": category, "text": text.strip()[:300],
             "value": value, "unit": unit[:30], "status": "claimed",
             "added_at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())}
    with _lock:
        data = load(project_id)
        data["claims"].append(claim)
        _save(project_id, data)
    return claim


DECISIONS = {"approved": "Evidence approved", "more_needed": "More evidence needed", "rejected": "Evidence rejected"}


def add_review(project_id: int, decision: str, note: str, reviewer: str, supported_claims: list[str]) -> dict:
    if decision not in DECISIONS:
        raise ValueError(f"Decision must be one of: {', '.join(DECISIONS)}")
    review = {"decision": decision, "note": note.strip()[:600], "reviewer": (reviewer.strip() or "Independent reviewer")[:80],
              "at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())}
    with _lock:
        data = load(project_id)
        for c in data["claims"]:
            if c["id"] in supported_claims:
                c["status"] = "supported" if decision != "rejected" else "claimed"
        review["fingerprint"] = "0x" + hashlib.sha256(json.dumps(
            {"items": [x["sha256"] for x in data["items"]], "review": review}, sort_keys=True).encode()).hexdigest()
        data["reviews"].append(review)
        _save(project_id, data)
    return review


def summary(project_id: int, check: dict | None = None) -> dict:
    """Everything the website needs about a project's evidence, with all flags in one list."""
    data = load(project_id)
    kinds_present = sorted({x["kind"] for x in data["items"]})
    file_flags = [dict(f, file=x["name"]) for x in data["items"] for f in x.get("flags", [])]
    sat = satellite_flags(check, data["claims"])
    return {
        **data,
        "kinds": KINDS,
        "claim_categories": CLAIM_CATEGORIES,
        "kinds_present": kinds_present,
        "completeness": {"have": len(kinds_present), "of": len(KINDS)},
        "flags": file_flags + sat,
        "review": data["reviews"][-1] if data["reviews"] else None,
    }


def file_path(project_id: int, file: str) -> Path | None:
    p = _folder(project_id) / Path(file).name
    return p if p.exists() and p.name != "index.json" else None
