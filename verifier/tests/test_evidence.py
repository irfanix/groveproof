"""Evidence flags and reviews (no internet needed)."""
import base64
import io

import pytest
from PIL import Image

from groveproof import evidence, settings

BOUNDARY = {"type": "Polygon", "coordinates": [[[78.77, 16.11], [78.785, 16.11], [78.785, 16.124], [78.77, 16.124], [78.77, 16.11]]]}


@pytest.fixture(autouse=True)
def tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(evidence, "DATA_DIR", tmp_path)


def photo_b64(color=(30, 120, 40), size=(800, 600), gps=None, software=None):
    img = Image.new("RGB", size, color)
    exif = Image.Exif()
    if software:
        exif[305] = software
    if gps:
        lat, lon = gps
        def dms(v):
            v = abs(v); d = int(v); m = int((v - d) * 60); s = round(((v - d) * 60 - m) * 60, 2)
            return (d, m, s)
        exif[0x8825] = {1: "N" if lat >= 0 else "S", 2: dms(lat), 3: "E" if lon >= 0 else "W", 4: dms(lon)}
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return base64.b64encode(buf.getvalue()).decode()


def test_photo_inside_forest_has_no_location_flag():
    item = evidence.add_file(1, "photo", "a.jpg", "image/jpeg", photo_b64(gps=(16.115, 78.778)), boundary=BOUNDARY)
    codes = {f["code"] for f in item["flags"]}
    assert "no_location" not in codes and "far_away" not in codes
    assert item["details"]["lat"] == pytest.approx(16.115, abs=1e-3)


def test_photo_far_from_forest_is_flagged():
    item = evidence.add_file(1, "photo", "b.jpg", "image/jpeg", photo_b64(color=(1, 2, 3), gps=(17.4, 78.5)), boundary=BOUNDARY)
    assert any(f["code"] == "far_away" for f in item["flags"])


def test_same_file_for_two_projects_is_flagged():
    data = photo_b64(color=(9, 9, 9))
    evidence.add_file(1, "photo", "x.jpg", "image/jpeg", data)
    item = evidence.add_file(2, "photo", "x.jpg", "image/jpeg", data)
    assert any(f["code"] == "duplicate" and "GP-1" in f["text"] for f in item["flags"])


def test_edited_and_missing_gps_photo_is_flagged():
    item = evidence.add_file(3, "photo", "c.jpg", "image/jpeg", photo_b64(color=(5, 6, 7), software="Adobe Photoshop 25.0"))
    codes = {f["code"] for f in item["flags"]}
    assert {"edited", "no_location"} <= codes


def test_review_marks_supported_claims_and_is_fingerprinted():
    c = evidence.add_claim(4, "jobs", "12 local forest guards hired", 12, "people")
    r = evidence.add_review(4, "approved", "Payroll seen", "Asha", [c["id"]])
    s = evidence.summary(4)
    assert s["claims"][0]["status"] == "supported"
    assert r["fingerprint"].startswith("0x") and s["review"]["decision"] == "approved"


def test_satellite_loss_raises_a_flag():
    flags = evidence.satellite_flags({"result": {"numbers": {"loss_pct": 6.2, "clear_pct": 95}}}, [])
    assert flags[0]["code"] == "satellite_loss"
