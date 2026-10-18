# GroveProof

**Forest carbon credits, checked from space before they are sold.**

GroveProof looks at free satellite pictures of a forest and works out how much of it is really there. Only then can a smart contract create carbon credits. The same land can only be registered once, credits from a forest that is later cut down get frozen, and anyone can run a check again to see if they get the same answer.

Built for the IEEE ClimateChain Global Hackathon, Track 1: Carbon Markets & Emissions Transparency.

> Prototype on the Polygon Amoy **test** network. Carbon numbers use a demo method based on IPCC default factors, **not an official carbon standard**.

---

## What it does (3 screens)

| Screen | What you do | What you get |
|---|---|---|
| 🛰️ **Check a forest** | Pick a sample forest or draw an area, press **Check this forest** | One verdict: ✅ Verified, 🟡 Needs review, ❌ Not eligible, ⧉ Already claimed, ☁ Can't check yet. Before/after pictures, forest map, "How we calculated this", and **Create credits** if Verified |
| 🌳 **My credits** | Connect MetaMask | Your forests with 🟢 Forest healthy / 🔒 Frozen badges, **Buy**, **Retire** and a retirement certificate |
| 🔍 **Look up a credit** | Type `GP-1` or `R-1` | The credit's story (registered → checked → created → sold → retired → frozen), **Re-run this check**, **Check this forest again**, and the **Try to cheat** panel |

## The three new ideas

1. **Already claimed (land-level double counting).** Every forest boundary becomes H3 map cells (resolution 9, about 0.1 km² each). The contract stores which project owns each cell and refuses any new project that overlaps.
2. **Living credits.** A new satellite check compares newer pictures with the last one. If 5% or more of the forest is gone, the contract **freezes** the remaining credits: they can no longer be created, bought, moved or retired. Credits retired earlier stay retired.
3. **Re-run this check.** Every check saves a recipe (boundary, exact satellite scene ids, dates, rules, carbon factors, model hash, code version). `keccak256(recipe)` and `keccak256(result)` go on-chain. Anyone can run it again and compare the result with what is on the blockchain.

When the data is unclear, GroveProof gives fewer credits, not more. Credits are reduced by an uncertainty deduction (20 to 35%) and a 10% buffer, cloudy land is never counted, and weak evidence becomes *Needs review*, never *Verified*.

How AI is used: every number comes from code, not from AI. A language model only writes a short explanation of the result, and a guard throws its text away if it contains any number that is not in the result.

---

## Folder structure

```
groveproof/
├── contracts/          Solidity smart contract (Hardhat)
│   ├── contracts/GroveProof.sol
│   ├── test/GroveProof.test.js     21 tests: every rule + the 5 "Try to cheat" attacks
│   └── scripts/deploy.js           writes shared/deployment.json (address + ABI)
├── verifier/           Python satellite checker + API (FastAPI)
│   ├── groveproof/
│   │   ├── satellite.py   Sentinel-2 from Microsoft Planetary Computer, cloud mask, median picture
│   │   ├── analysis.py    forest map, tree loss, verdict rules
│   │   ├── carbon.py      credit formula (code only)
│   │   ├── cells.py       boundary → H3 map cells
│   │   ├── pipeline.py    recipe → result, saved pictures
│   │   ├── rerun.py       re-run a recipe and compare hashes
│   │   ├── explain.py     plain-language text + number guard
│   │   ├── chain.py       verifier wallet writes verdicts on-chain
│   │   ├── api.py         the API the website calls
│   │   ├── config.yaml    every rule and threshold
│   │   └── factors.json   IPCC factors with sources (TO VERIFY)
│   ├── scripts/train_model.py     trains the Random Forest forest model
│   ├── scripts/cache_samples.py   saves sample results for a reliable demo
│   ├── samples/samples.json       sample forests
│   └── tests/                     28 tests (no internet needed)
├── web/                React + Vite + Tailwind website (3 screens)
├── eval/               evaluation areas + run_eval.py
└── shared/             deployment.json (created by the deploy script)
```

---

## Run it on your computer

You need: **Node.js 20+**, **Python 3.11+**, **Git**, and the **MetaMask** browser extension.

### 1. Smart contract

```bash
cd contracts
npm install
npx hardhat test                      # should say: 22 passing
```

**Deploy to Polygon Amoy (free test network):**

1. Make two MetaMask accounts: one **deployer/owner**, one **verifier** (the server uses this one). Export their private keys (MetaMask → account → Account details). Use test wallets only.
2. Get free test POL for both from the Polygon faucet (search "Polygon Amoy faucet").
3. `cp .env.example .env` and fill in `DEPLOYER_PRIVATE_KEY` and `VERIFIER_ADDRESS`.
4. Deploy:

```bash
npx hardhat run scripts/deploy.js --network amoy
```

This creates `shared/deployment.json`. Commit it: the website and the verifier both read it.

### 2. Satellite checker (verifier)

```bash
cd verifier
python -m venv .venv
# Windows: .venv\Scripts\activate     Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
pytest -q                              # should say: 28 passed
cp .env.example .env                   # fill RPC_URL and VERIFIER_PRIVATE_KEY (and LLM_API_KEY if you want AI text)
uvicorn groveproof.api:app --reload --port 8000
```

Open http://localhost:8000/api/health. `"chain": true` means it is connected to the contract.

**Train the forest model** (about 10 to 20 minutes, needs internet):

```bash
python scripts/train_model.py
```

Without a model, the checker uses a simple NDVI rule and says so on screen.

**Save the sample results** (do this after training, and after you confirm each sample area on a satellite map):

```bash
python scripts/cache_samples.py
```

It prints each verdict and warns you if it differs from the expected one. Commit `samples/samples.json` and `samples/cache/`.

### 3. Website

```bash
cd web
npm install
cp .env.example .env.local             # VITE_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:5173.

### Try the full flow

1. **Check a forest** → Nallamala hills forest → **Check this forest** → ✅ Verified → **Create credits** (2 MetaMask confirmations).
2. **Check a forest** → Overlapping claim → **Check this forest** → ⧉ Already claimed (blue hexagons on the map).
3. **My credits** → switch MetaMask to another account → **Buy** → **Retire** → certificate.
4. **Look up a credit** → `GP-1` → press every **Try it** button: all five are refused.
5. **Look up a credit** → **Re-run this check** → ✓ Same result as the blockchain record.

---

## Deploy online (free)

**Verifier on Render:** New → Web Service → this repo. Root directory `verifier`. Build `pip install -r requirements.txt`. Start `uvicorn groveproof.api:app --host 0.0.0.0 --port $PORT`. Add environment variables from `verifier/.env.example` (set `ALLOWED_ORIGINS` to the Vercel address). The free plan sleeps after 15 minutes; open `/api/health` a minute before judging or a demo.

**Website on Vercel:** New Project → this repo. Root directory `web`. Add `VITE_API_URL` (the Render address), `VITE_RPC_URL`, `VITE_CHAIN_ID=80002`, `VITE_EXPLORER_URL=https://amoy.polygonscan.com`.

---

## How a check works

```
boundary ─► H3 map cells ─► already claimed on-chain? ── yes ─► ⧉ Already claimed
                                    │ no
                                    ▼
Sentinel-2 scenes (before window, after window)
  ─► remove clouds (Scene Classification Layer) ─► median picture
  ─► forest map per 10 m pixel (Random Forest: 6 bands + NDVI + NDMI)
  ─► tree loss = forest before AND not forest after AND NDVI dropped ≥ 0.1
  ─► verdict rules (config.yaml)
  ─► credits (carbon.py)
  ─► recipe.json + result.json ─► keccak256 hashes ─► recordVerification on-chain
```

Verdict rules, in order:

| Rule | Verdict |
|---|---|
| Less than 70% of the area cloud-free in both pictures | ☁ Can't check yet |
| Less than 30% of the area is forest now | ❌ Not eligible |
| Tree loss 5% or more | ❌ Not eligible |
| Tree loss 2% to 5%, or the forest map is unsure about more than 20% of the area | 🟡 Needs review |
| Otherwise | ✅ Verified |

Credit formula (code only):

```
CO₂ per year = forest ha × growth (t/ha/yr) × (1 + root:shoot) × 0.47 × 44/12
credits      = floor( CO₂ per year × (1 − uncertainty deduction) × (1 − 10% buffer) )
```

## Smart contract rules

| Function | Who | Refused when |
|---|---|---|
| `registerProject(cells, uri)` | anyone | any cell already claimed (`AlreadyClaimed`), 0 or more than 300 cells |
| `recordVerification(...)` | verifier only | not the verifier, project frozen, credits on a non-Verified verdict |
| `issueCredits(id, n)` | project owner | not Verified, frozen, more than the satellites allow (`ExceedsVerifiedCredits`) |
| `buy(id, n)` | anyone | frozen, wrong payment, not enough credits for sale |
| `retire(id, n, for)` | credit holder | frozen, not enough credits (retired credits are burned) |
| `recordRecheck(id, lossBps, ...)` | verifier only | not the verifier; loss ≥ 5% freezes the project |

Gas: registering a full-size forest (300 cells, about 30 km²) uses about 7.1 million gas, well under the Amoy block limit.

---

## Still to do before submission

- [ ] Check every value in `verifier/groveproof/factors.json` against the IPCC 2019 Refinement tables, then set `"verified": true`
- [ ] Confirm the sample areas on a satellite map; choose the **cleared forest** sample on Global Forest Watch
- [ ] `python scripts/train_model.py` and write the held-out accuracy here
- [ ] Fill `eval/areas.geojson` with 10 cleared and 10 stable areas, run `python ../eval/run_eval.py`, paste the table here
- [ ] Deploy contract to Amoy, verifier to Render, website to Vercel
- [ ] README sections: opening scene, problem with sources, worked example, threat table, "What it is not", limitations, team table, AI usage disclosure

## Evaluation

*(to fill with `eval/run_eval.py` results)*

## Limitations

- Sentinel-2 sees the canopy from above: small-scale degradation under the canopy and selective logging can be missed.
- A young plantation can look green like a forest; clearing followed by quick replanting may pass.
- Monsoon clouds can hide the land for months (the app answers *Can't check yet* instead of guessing).
- The carbon method is a demo based on IPCC default factors, not a certified methodology.
- Saved checks of drawn areas are stored on the server disk; on free hosting they can be lost on restart. Sample checks are kept in the repo.
- Land ownership and legal rights are not checked.

## License

MIT
