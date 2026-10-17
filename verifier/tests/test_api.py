"""API tests. The blockchain and satellites are replaced with fakes, so no internet is needed."""
from fastapi.testclient import TestClient

from groveproof import api, chain

client = TestClient(api.app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_samples_only_lists_samples_with_a_boundary():
    r = client.get("/api/samples")
    ids = [s["id"] for s in r.json()["samples"]]
    assert "nallamala-healthy" in ids
    assert "cleared-forest" not in ids  # boundary still to be chosen


def test_already_claimed_comes_straight_from_the_contract(monkeypatch):
    monkeypatch.setattr(chain, "claimed_cells", lambda cells: {cells[0]: 1, cells[1]: 1})
    r = client.post("/api/check", json={"sample_id": "nallamala-overlap"})
    body = r.json()
    assert r.status_code == 200
    assert body["result"]["verdict"] == "AlreadyClaimed"
    assert body["claimed_by"] == 1
    assert "GP-1" in body["result"]["reason"]


def test_too_big_area_is_refused():
    big = {"type": "Polygon", "coordinates": [[[78.0, 16.0], [78.5, 16.0], [78.5, 16.5], [78.0, 16.5], [78.0, 16.0]]]}
    r = client.post("/api/check", json={"boundary": big, "before": ["2025-01-01", "2025-03-31"],
                                        "after": ["2026-01-01", "2026-03-31"]})
    assert r.status_code == 400
    assert "too big" in r.json()["detail"]


def test_record_needs_the_chain():
    r = client.post("/api/record/1", params={"check_id": "abc"})
    assert r.status_code == 503


def test_files_are_restricted():
    assert client.get("/api/checks/abc/../../secret").status_code == 404
    assert client.get("/api/checks/abc/secret.txt").status_code == 404
