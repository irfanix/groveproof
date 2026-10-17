"""Re-run a saved check and prove the result is the same.

    python -m groveproof.rerun path/to/recipe.json [path/to/result.json]

"Don't trust us. Re-run it."  It downloads exactly the same satellite scenes,
uses the same rules, factors and model, and compares the result hash.
"""
from __future__ import annotations

import json
import sys

from .hashing import keccak_hex
from .pipeline import run_recipe


def rerun(recipe: dict, expected_result: dict | None = None, loader=None, model=None) -> dict:
    result, _ = run_recipe(recipe, loader=loader, model=model)
    out = {
        "recipe_hash": keccak_hex(recipe),
        "result_hash": keccak_hex(result),
        "verdict": result["verdict"],
        "credits": result["credits"]["credits"],
    }
    if expected_result is not None:
        expected_hash = keccak_hex(expected_result)
        out["expected_result_hash"] = expected_hash
        out["same"] = expected_hash == out["result_hash"]
        if not out["same"]:
            out["differences"] = {
                k: {"saved": expected_result["numbers"].get(k), "rerun": v}
                for k, v in result["numbers"].items()
                if expected_result["numbers"].get(k) != v
            }
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    recipe = json.load(open(sys.argv[1]))
    expected = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
    out = rerun(recipe, expected)
    print(json.dumps(out, indent=2))
    if expected is not None:
        print("\n✓ Same result" if out["same"] else "\n✗ Different result")


if __name__ == "__main__":
    main()
