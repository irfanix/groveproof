# GroveProof

**Forest carbon credits, checked from space before they are sold.**

Satellites verify. The contract decides. No credit counts twice.

[Live app](https://groveproof.vercel.app) · [Smart contract on Polygon Amoy](https://amoy.polygonscan.com/address/0x7868F686f1419A9dECD5456776c2126e8feF8769) · IEEE ClimateChain Global Hackathon, Track 1: Carbon Markets & Emissions Transparency

> This is a prototype on a **test** network. The coins have no value, and the carbon numbers use a demo method built on IPCC default factors. It is not an official carbon standard.

---

## Why I built this

I live in a village in Andhra Pradesh, the state with some of India's largest dry forests, like the Nallamala and Seshachalam hills. When I started reading about forest carbon credits, the part that bothered me was simple: a company pays for a forest it will never see, and the proof it gets is a PDF.

The numbers say that proof is often wrong. A study of more than 2,300 carbon crediting projects found that fewer than 16% of the credits matched real emission reductions, and avoided-deforestation projects reached only about a quarter of what they claimed ([Probst et al., Nature Communications, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11564741/)).

Three problems keep coming back:

1. **Nobody checks the forest.** It may be smaller than claimed, or partly cut.
2. **The same land gets sold twice,** by two projects whose maps overlap.
3. **Nobody can repeat the math.** The calculation sits in a report, not in code anyone can run.

Free satellite pictures already cover every forest on Earth every few days. Blockchains are good at one thing: refusing to break their own rules. GroveProof puts the two together.

## What it does

- **Check a forest.** Pick a sample forest, or search any place and draw an area. The checker downloads Sentinel-2 pictures from two dates, removes clouds, maps forest pixel by pixel and measures tree loss. You get one answer: Verified, Needs review, Not eligible, Already claimed, or Can't check yet.
- **Create credits.** Only a Verified forest can become credits, and only up to the number the satellites allow. The smart contract enforces this. The website cannot override it.
- **Buy and retire.** Credits are ERC-1155 tokens. Retiring burns them and creates a certificate (R-1, R-2, ...) that anyone can look up or scan.
- **Look up anything.** Type `GP-1` or `R-1` to see the forest, the satellite pictures, who holds the credits, every sale and retirement, and a QR code.

**On the test network right now:** 3 forest projects (GP-1, GP-2, GP-3), 80 credits created, 3 sales, 2 credits retired with certificate R-1, and one land claim refused because it overlaps GP-1.

## Who decides what

| Decision | Made by | Can it be overridden? |
|---|---|---|
| Is this land already claimed? | Smart contract (map cells) | No |
| How much forest, how much loss | Code (Random Forest model plus fixed rules) | No, but anyone can re-run it |
| Verified or not | Fixed rules in `config.yaml`, in a fixed order | No |
| How many credits | Code (`carbon.py`), formula shown on screen | No |
| Recording the verdict on-chain | Verifier wallet (server only) | Only the verifier role can write it |
| Creating credits | Project owner, capped by the contract | Never above the satellite limit |
| The plain-language summary | Template, or a language model | Its text is thrown away if it contains a number that is not in the result |

## Worked example: Nallamala hills forest

1. **Land.** A 0.015° square in the Nallamala hills becomes 23 H3 map cells (about 0.1 km² each). The contract says none of them is claimed, so the check goes on.
2. **Pictures.** The clearest Sentinel-2 scenes from Nov 2024 to Jan 2025 (before) and Nov 2025 to Jan 2026 (after). Clouds removed with the Scene Classification Layer.
3. **Forest map.** 246.5 ha of forest now, 0% tree loss, 100% of the land seen clearly.
4. **Rules.** Clear enough, mostly forest, loss under 2%, model confident. Verdict: **Verified**.
5. **Credits.**
   ```
   246.5 ha × 1.5 t growth × (1 + 0.28 roots) × 0.47 carbon × 44/12 = 815.6 t CO₂ per year
   815.6 × (1 − 25% uncertainty) × (1 − 10% buffer)                 = 550 credits
   ```
6. **Proof.** The recipe (boundary, exact scene IDs, dates, rules, factors, model hash, code version) and the result are hashed with keccak256. The verifier writes both hashes on-chain when the forest is registered.

Total time for a fresh check: about 20 seconds.

## How it works

```
Browser (React) ──reads──► Smart contract on Polygon Amoy ◄──writes verdict── Checker (Python, FastAPI)
      │ MetaMask: register, create, buy, retire                                     │
      └───────────── "check this forest" ──────────────────────────────────────────►│
                                                                                     ▼
                                                  Sentinel-2 via Microsoft Planetary Computer
```

```
boundary ─► H3 map cells ─► claimed on-chain? ── yes ─► Already claimed
                                  │ no
                                  ▼
Sentinel-2, before and after (same months, one year apart)
 ─► cloud mask ─► median picture ─► forest map per 10 m pixel (Random Forest)
 ─► tree loss = forest before, and now: not forest with NDVI down ≥ 0.1,
                 OR greenness (NDVI) or moisture (NDMI) down ≥ 0.15 (cleared, even if weeds grew back)
 ─► verdict rules ─► credits ─► recipe + result hashes ─► recordVerification on-chain
```

**Verdict rules, checked in this order** (the first one that fails decides):

| Rule | Verdict |
|---|---|
| Less than 70% of the area cloud-free in both pictures | Can't check yet |
| Less than 1 ha of forest, now or in the earlier picture | Not eligible |
| Less than 30% of the area is forest now | Not eligible |
| Tree loss 5% or more | Not eligible |
| Tree loss 2% to 5%, or the model is unsure about more than 20% of the area | Needs review |
| Everything passes | Verified |

**Three ideas I have not seen together elsewhere:**

1. **Land-level double counting.** The contract stores which project owns each map cell and refuses any new project that touches one.
2. **Living credits.** A later check compares newer pictures with the last ones. If 5% or more of the forest is gone, the contract freezes the remaining credits. Credits already retired stay retired.
3. **Re-runnable checks.** Anyone can run a saved recipe again and compare the result hash with the one on-chain.

**When unsure, credit less.** At least 28% of every estimate is held back (20 to 35% for uncertainty, plus a 10% buffer). Cloudy pixels are never counted. Outside the region where I have carbon factors, the app shows the satellite result but no credit number.

## Results

### The test that changed the project

I picked 20 places the system had never seen, using [Global Forest Watch](https://www.globalforestwatch.org/map/) (now Global Nature Watch): **10 patches where forest was cleared in 2024** (Eastern Ghats, Andhra Pradesh) and **10 dense protected forests** with no recorded loss (Similipal, Achanakmar, Indravati, Nagarhole, Bandipur, Papikonda, Seshachalam). None of them touches the land the forest model was trained on; `eval/make_areas.py` refuses any that does. Each area was checked for real, then re-run from its saved recipe.

| | First run (rules 1.2) | After the fix (rules 1.4) |
|---|---|---|
| **Cleared forests marked Verified** (the number that must be 0) | **8 of 10** | **1 of 10** |
| Cleared forests caught (Not eligible or Needs review) | 2 of 10 | 9 of 10 |
| Healthy forests Verified | 10 of 10 | 10 of 10 |
| Healthy forests wrongly flagged | 0 of 10 | 0 of 10 |
| Re-run gave the same hash | 20 of 20 | 20 of 20 |
| Average check time | 26 s | 23 s |

**What went wrong the first time.** The first run missed 8 of 10 clearings. In the after picture I could see a brown cleared patch, but the forest map was all green. The model learned "forest" from a very broad label (any land with more than 10% tree cover), and by November weeds and crops had grown back on the cleared land, so it still looked green enough.

**How I fixed it, with numbers instead of guesses.** I added `eval/collect.py`, which measures every pixel of the 20 areas, and compared cleared land with healthy forest:

| Signal (same months, one year apart) | Pixels changed in the 2 biggest clearings | Pixels changed in healthy forests (worst of 10) |
|---|---|---|
| Greenness (NDVI) down ≥ 0.15 | about 18% | 0% |
| Moisture (NDMI, short-wave infrared) down ≥ 0.15 | about 24% | 0.6% |

Greenness comes back quickly after clearing, but the land stays drier. I tried 6 rules on the measurements and kept the one that caught the most clearings with no false alarms on healthy forest: **a forest pixel is cleared if its greenness or its moisture dropped by 0.15 or more**, whatever the model says. The real run then matched the simulation pixel for pixel (for example 23.8% loss predicted and measured on area loss-01).

**Honest limits of this test.** I chose the rule after looking at these same 20 areas, so 9 of 10 is a best case. 10 + 10 areas is a small sample, all the clearings come from one region, and the one clearing still marked Verified (loss-10) showed almost no change in any signal. A fresh set of areas from other states is the next test (see What's next). Results: `eval/results.json`, measurements: `eval/measurements.json`.


**Forest model.** Random Forest on 6 Sentinel-2 bands plus NDVI and NDMI. Accuracy on held-out pixels it never trained on: **93.1%**.

**Sample forests, checked live** (`scripts/verify_samples.py`, report in `verifier/samples/sample_report.md`):

| Sample | Expected | Result |
|---|---|---|
| Nallamala hills forest | Verified | Verified: 246.5 ha, 0.0% loss, 100% clear |
| Seshachalam hills forest | Verified | Verified: 264.4 ha, 0.0% loss, 98.3% clear |
| Papikonda hills forest | Verified | Verified: 260.9 ha, 0.01% loss, 100% clear |
| Same forest, monsoon dates | Can't check yet | Can't check yet: only 14.6% seen through the clouds |
| Overlapping claim (land of GP-1) | Already claimed | Already claimed: 1 of 22 map cells belongs to GP-1 |

**The season experiment.** The same Seshachalam square, checked twice:

| Dates (both years) | Tree loss | Verdict |
|---|---|---|
| January to March | 11.3% | Not eligible |
| November to January | 0.0% | Verified |

The forest did not change. The trees did: dry deciduous forest drops its leaves from February, and bare branches look like lost forest from space. A credit system that ignores the season would punish a healthy forest, or, the other way round, miss real clearing hidden by leaf fall. GroveProof now compares the same green-season months in both years by default and explains why on screen.

**Attacks the contract refuses** (all in the test suite):

| Attack | Refused with |
|---|---|
| Retire the same credit twice | `NotEnoughCredits` (retired credits are burned) |
| Create more credits than the satellites allow | `ExceedsVerifiedCredits` |
| Register land that is already claimed | `AlreadyClaimed` |
| Buy credits from a frozen forest | `ProjectIsFrozen` |
| Record a verdict without being the verifier | `AccessControlUnauthorizedAccount` |

**Tests:** 22 contract tests and 40 checker tests, all passing.

## What could go wrong

| Risk | What GroveProof does |
|---|---|
| Clouds hide the land | Below 70% clear: no verdict, "Can't check yet" |
| Leaf fall looks like tree loss | Same green-season months in both years, by default |
| Cleared land grows weeds and looks green again | Moisture (NDMI) and greenness drops count as clearing, even if the model still says forest |
| The model is unsure (scrub, scattered trees, young plantation) | More than 20% unsure pixels: Needs review, never Verified |
| A project claims more credits | The contract caps credits at the satellite number |
| Two projects claim the same land | Map cells: the second one is refused |
| The forest is cut after credits are sold | A re-check freezes the remaining credits |
| A fake verifier | Only the verifier role can write verdicts |
| A language model invents a number | Any number not in the result throws its text away |
| Wrong carbon factors | Factors are versioned inside every recipe, so old checks stay traceable |

## A mistake I found in my own numbers

While writing this README I checked my carbon factors against the IPCC tables. I had used a growth rate of **2.0** t/ha/yr, which is the value for *insular* Asia (islands like Indonesia). Andhra Pradesh is *continental* Asia: **1.5**. My credits were about 25% too high.

| Factor | Value now | Source |
|---|---|---|
| Growth, tropical dry forest, continental Asia, older than 20 years | 1.5 t dry matter/ha/yr | IPCC 2006 Guidelines, Vol. 4, Ch. 4, Table 4.9 |
| Root to shoot ratio, tropical dry forest | 0.28 | IPCC 2006, Table 4.4 (the 2019 Refinement says 0.44 for Asia; I keep the lower value) |
| Carbon fraction | 0.47 | IPCC 2006, Table 4.3 |

It is fixed (`factors-1.1`). GP-1, GP-2 and GP-3 were created before the fix, and they stay on the blockchain as they are. Their recipes record the factors they used, which is exactly why the factors live inside the recipe. I checked the values against a published summary of the IPCC tables, not the printed page, so the app still labels them "being checked".

## Other problems I hit

| Problem | Fix | What I learned |
|---|---|---|
| A check took 6 minutes | Download before and after pictures in parallel, keep the 6 clearest scenes | 20 seconds now. Measure first. |
| Polygon blocks crashed the Python library | Added the proof-of-authority middleware | Test on the real network early |
| MetaMask's node was a few blocks behind and sent failing transactions | The site tests every transaction on its own node first and sets the fee itself | Don't trust one node |
| Public nodes only search 10,000 blocks at a time | Read events in 9,000-block pieces, 4 at a time | Passports load in about 2 seconds instead of 30+ |
| A wrong sentence: "57.7% is forest, at least 30% needed: Not eligible" | Each rule now has its own message | Every message is part of the proof |
| My own test showed 8 of 10 cleared forests marked Verified | Measured every pixel, added a moisture-based clearing check | 1 of 10 now. Test on places you did not choose |

## What it is not

- Not a certified carbon standard (not Verra, not Gold Standard).
- It does not prove **additionality**, meaning whether the forest would have been cut without the project. Satellites cannot see that.
- It does not check land ownership or the rights of people who live in the forest.
- It runs on a test network with test coins.

## Limitations

- Sentinel-2 sees the canopy from above. Logging under the canopy can be missed.
- A young plantation can look like forest.
- Carbon factors are set up only for tropical dry forest in peninsular and central India.
- The online checker runs on a free server that sleeps after 15 minutes. The first request can take about a minute.
- Evidence files uploaded online can be lost when the free server restarts.

## What's next

1. A fresh test on cleared forests from other states (Odisha, Chhattisgarh, Telangana) that played no part in choosing the clearing rule, and a forest model retrained on green-season pictures with a stricter forest label.
2. Carbon factors for more forest types, each with its source in the recipe.
3. Automatic yearly re-checks, so living credits stay living without anyone pressing a button.
4. Field evidence (geotagged photos, forest department reports) reviewed by a second person before credits are created. The upload and review screens already exist.

---

## Run it yourself

You need Node.js 20+, Python 3.11+, Git and MetaMask. Use test wallets only.

**Smart contract**
```bash
cd contracts
npm install
npx hardhat test                      # 22 passing
cp .env.example .env                  # AMOY_RPC_URL, DEPLOYER_PRIVATE_KEY, VERIFIER_ADDRESS
npx hardhat run scripts/deploy.js --network amoy   # writes shared/deployment.json
```

**Satellite checker**
```bash
cd verifier
python -m venv .venv
# Windows: .venv\Scripts\activate     Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
pytest -q                              # 40 passed
cp .env.example .env                   # RPC_URL, VERIFIER_PRIVATE_KEY
uvicorn groveproof.api:app --reload --port 8000
```
Open http://localhost:8000/api/health. `"chain": true` means it found the contract.

Scripts: `train_model.py` trains the forest model, `verify_samples.py` checks every sample forest for real and writes a report, `save_project_checks.py` copies the checks behind real projects into the repo so they work online.

**Website**
```bash
cd web
npm install
cp .env.example .env.local             # VITE_API_URL=http://localhost:8000
npm run dev
```

**Online (free):** the checker deploys to Render from `render.yaml` (add `VERIFIER_PRIVATE_KEY` and `ALLOWED_ORIGINS`). The website deploys to Vercel with root directory `web` and the four `VITE_` variables as plain config values.

## Folder structure

```
contracts/   Solidity contract, tests, deploy script (Hardhat)
verifier/    Python satellite checker and API (FastAPI)
  groveproof/  satellite, analysis, carbon, cells, pipeline, rerun, chain, api
  samples/     sample forests, their saved results, sample_report.md
  scripts/     train_model, verify_samples, save_project_checks
web/         React website
eval/        evaluation areas and run_eval.py
shared/      deployment.json (contract address and ABI)
render.yaml  settings for the online checker
```

## Built with

Solidity 0.8.24, OpenZeppelin, Hardhat · Python 3.12, FastAPI, odc-stac, scikit-learn, h3, web3.py · React 18, Vite, Tailwind, Leaflet, ethers v6 · Sentinel-2 via Microsoft Planetary Computer · OpenStreetMap Nominatim · Polygon Amoy · Vercel and Render

## Team

| Name | Role |
|---|---|
| Irfan Dawood | Solo builder: research, satellite checker, smart contract, website |

## AI use

I used an AI assistant (Claude, by Anthropic) while building: for code, debugging and help with writing. Every number in the app and in this README comes from running the code, the tests or the live network.

## License

MIT
