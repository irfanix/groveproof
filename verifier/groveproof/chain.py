"""Talks to the GroveProof smart contract as the verifier.

The verifier wallet's private key lives only on the server (VERIFIER_PRIVATE_KEY),
never in the browser. If the chain is not configured, the API still works in
"offline demo" mode (verdicts only, nothing written on-chain).
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

VERDICT_CODE = {"Verified": 1, "NeedsReview": 2, "NotEligible": 3, "CantCheckYet": 4}
DEPLOYMENT = Path(__file__).resolve().parents[2] / "shared" / "deployment.json"


def configured() -> bool:
    return bool(os.getenv("RPC_URL") and os.getenv("VERIFIER_PRIVATE_KEY") and _deployment())


@lru_cache
def _deployment() -> dict | None:
    path = Path(os.getenv("DEPLOYMENT_FILE", DEPLOYMENT))
    return json.loads(path.read_text()) if path.exists() else None


@lru_cache
def _web3():
    from web3 import Web3
    w3 = Web3(Web3.HTTPProvider(os.environ["RPC_URL"], request_kwargs={"timeout": 60}))
    # Polygon blocks carry extra signer data; without this web3 refuses to read them.
    try:
        from web3.middleware import ExtraDataToPOAMiddleware
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    except ImportError:  # web3 6
        from web3.middleware import geth_poa_middleware
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    d = _deployment()
    contract = w3.eth.contract(address=Web3.to_checksum_address(d["address"]), abi=d["abi"])
    account = w3.eth.account.from_key(os.environ["VERIFIER_PRIVATE_KEY"])
    return w3, contract, account


def _send(fn) -> str:
    w3, _, account = _web3()
    tx = fn.build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address, "pending"),
        "chainId": w3.eth.chain_id,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    if receipt.status != 1:
        raise RuntimeError("Transaction failed on-chain")
    return "0x" + bytes(tx_hash).hex().removeprefix("0x")


def claimed_cells(cells: list[str]) -> dict[str, int]:
    """Which of these cells are already claimed on-chain -> {cell: projectId}."""
    if not configured():
        return {}
    _, contract, _ = _web3()
    out = {}
    for c in cells:
        pid = contract.functions.cellProject(int(c)).call()
        if pid:
            out[c] = int(pid)
    return out


def project(project_id: int) -> dict:
    _, contract, _ = _web3()
    p = contract.functions.getProject(project_id).call()
    keys = ["owner", "metadataURI", "cellCount", "verdict", "maxCredits", "issued", "retired",
            "recipeHash", "resultHash", "lastLossBps", "frozen", "checkedAt"]
    d = dict(zip(keys, p))
    for k in ("recipeHash", "resultHash"):
        d[k] = "0x" + bytes(d[k]).hex()
    return d


def project_cells(project_id: int) -> list[str]:
    """Cells of a project.

    Fast path: the project's metadata names the saved check it came from, and that check lists
    the cells; the contract then confirms every one of them belongs to this project.
    Slow path: the ProjectRegistered event, searched newest blocks first in 9,000-block pieces
    (public RPCs refuse bigger searches).
    """
    w3, contract, _ = _web3()
    meta = contract.functions.getProject(project_id).call()[1]
    parts = str(meta).split(":")
    if len(parts) >= 2 and parts[0] == "groveproof":
        try:
            from . import pipeline
            c = pipeline.load_check(parts[1])
            if c and cells_match(project_id, c["cells"]):
                return [str(x) for x in c["cells"]]
        except Exception:
            pass
    start = int(os.getenv("DEPLOY_BLOCK") or (_deployment() or {}).get("deployBlock", 0))
    latest = w3.eth.block_number
    step = 9000
    to = latest
    while to >= start:
        frm = max(start, to - step + 1)
        logs = contract.events.ProjectRegistered().get_logs(
            from_block=frm, to_block=to, argument_filters={"projectId": project_id})
        if logs:
            return [str(c) for c in logs[0]["args"]["cells"]]
        to = frm - 1
    raise ValueError(f"Project {project_id} not found")


def cells_match(project_id: int, cells: list[str]) -> bool:
    """True if the project owns exactly these cells (every cell maps to it and the count is equal)."""
    _, contract, _ = _web3()
    if int(contract.functions.getProject(project_id).call()[2]) != len(cells):
        return False
    return all(int(contract.functions.cellProject(int(c)).call()) == project_id for c in cells)


def record_verification(project_id: int, verdict: str, max_credits: int, recipe_hash: str, result_hash: str) -> str:
    _, contract, _ = _web3()
    return _send(contract.functions.recordVerification(
        project_id, VERDICT_CODE[verdict], max_credits if verdict == "Verified" else 0,
        bytes.fromhex(recipe_hash[2:]), bytes.fromhex(result_hash[2:])))


def record_recheck(project_id: int, loss_bps: int, recipe_hash: str, result_hash: str) -> str:
    _, contract, _ = _web3()
    return _send(contract.functions.recordRecheck(
        project_id, loss_bps, bytes.fromhex(recipe_hash[2:]), bytes.fromhex(result_hash[2:])))
