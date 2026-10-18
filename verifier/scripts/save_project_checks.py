"""Copy the satellite checks behind every real project into samples/cache, so they go to GitHub.

    python scripts/save_project_checks.py

Checks are normally saved in data/ (not uploaded). The online checker only sees what is
in GitHub, so without this the passports of GP-1, GP-2 ... would have no satellite pictures online.
"""
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from groveproof import chain, pipeline  # noqa: E402
from groveproof.settings import SAMPLES_DIR  # noqa: E402

if not chain.configured():
    sys.exit("The blockchain is not connected (check RPC_URL and VERIFIER_PRIVATE_KEY in .env).")

_, contract, _ = chain._web3()
count = int(contract.functions.projectCount().call())
missing = 0
for pid in range(1, count + 1):
    meta = contract.functions.getProject(pid).call()[1]
    parts = str(meta).split(":")
    check_id = parts[1] if len(parts) >= 2 and parts[0] == "groveproof" else None
    src = pipeline.DATA_DIR / "checks" / check_id if check_id else None
    dest = SAMPLES_DIR / "cache" / check_id if check_id else None
    if dest and dest.exists():
        print(f"GP-{pid}: already saved ({check_id})")
    elif src and src.exists():
        shutil.copytree(src, dest)
        print(f"GP-{pid}: saved {check_id}")
    else:
        missing += 1
        print(f"GP-{pid}: check {check_id} is not on this computer")
print("Done." if not missing else f"Done, {missing} not found.")
