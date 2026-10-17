"""Stable hashing, so the same recipe or result always gives the same hash.

We hash a "canonical" JSON text (sorted keys, no spaces) with keccak256, the
same hash function the smart contract uses. The 0x... value is what goes
on-chain as recipeHash / resultHash.
"""
from __future__ import annotations

import json
import math

from eth_utils import keccak


def _clean(obj):
    """Make floats stable: round to 6 decimals and turn -0.0 into 0.0."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            raise ValueError("NaN or infinity cannot be hashed")
        r = round(obj, 6)
        return 0.0 if r == 0 else r
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    return obj


def canonical_json(obj) -> str:
    return json.dumps(_clean(obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def keccak_hex(obj) -> str:
    """0x-prefixed keccak256 of the canonical JSON of obj (a bytes32 for the contract)."""
    return "0x" + keccak(text=canonical_json(obj)).hex()
