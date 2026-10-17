// Everything about the GroveProof smart contract: reading, wallet, and plain-language refusal reasons.
import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from "ethers";

// shared/deployment.json is written by `npx hardhat run scripts/deploy.js`.
const found = import.meta.glob("../../../shared/deployment.json", { eager: true });
export const deployment = Object.values(found)[0]?.default || null;

export const RPC_URL = import.meta.env.VITE_RPC_URL || "https://rpc-amoy.polygon.technology";
export const EXPLORER = (import.meta.env.VITE_EXPLORER_URL || "https://amoy.polygonscan.com").replace(/\/$/, "");
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || deployment?.chainId || 80002);

export const VERDICT_NAMES = ["None", "Verified", "NeedsReview", "NotEligible", "CantCheckYet"];
export const hasChain = () => Boolean(deployment);

let readProvider;
export function reader() {
  if (!deployment) throw new Error("The contract is not deployed yet.");
  readProvider ||= new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
  return new Contract(deployment.address, deployment.abi, readProvider);
}

export const txUrl = (hash) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a) => `${EXPLORER}/address/${a}`;
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const priceText = () => (deployment ? `${formatEther(deployment.pricePerCreditWei)} POL` : "");

// ------------------------------------------------------------------ wallet

export async function connectWallet() {
  if (!window.ethereum) throw new Error("Please install MetaMask to create, buy or retire credits. You can still look at everything without it.");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) await switchNetwork();
  const p2 = new BrowserProvider(window.ethereum);
  const signer = await p2.getSigner();
  return { signer, address: await signer.getAddress(), contract: new Contract(deployment.address, deployment.abi, signer) };
}

async function switchNetwork() {
  const hex = "0x" + CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    if (e.code !== 4902) throw new Error("Please switch MetaMask to the Polygon Amoy test network.");
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hex, chainName: "Polygon Amoy (test)", rpcUrls: [RPC_URL],
                 nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, blockExplorerUrls: [EXPLORER] }],
    });
  }
}

// ------------------------------------------------------------------ projects

export async function getProject(id) {
  const p = await reader().getProject(id);
  return {
    id: Number(id),
    owner: p.owner,
    metadataURI: p.metadataURI,
    cellCount: Number(p.cellCount),
    verdict: VERDICT_NAMES[Number(p.verdict)],
    maxCredits: Number(p.maxCredits),
    issued: Number(p.issued),
    retired: Number(p.retired),
    recipeHash: p.recipeHash,
    resultHash: p.resultHash,
    lastLossBps: Number(p.lastLossBps),
    frozen: p.frozen,
    checkedAt: Number(p.checkedAt),
  };
}

export async function listProjects() {
  const n = Number(await reader().projectCount());
  return Promise.all(Array.from({ length: n }, (_, i) => getProject(i + 1)));
}

// metadataURI is "groveproof:<check id>:<name>"
export function parseMeta(uri = "") {
  const [tag, checkId, ...rest] = uri.split(":");
  return tag === "groveproof" ? { checkId, name: decodeURIComponent(rest.join(":")) } : { checkId: null, name: uri };
}
export const makeMeta = (checkId, name) => `groveproof:${checkId}:${encodeURIComponent(name)}`;

// Event history of one project, read in block ranges (public RPCs limit how far one search can go).
export async function projectHistory(projectId) {
  const c = reader();
  const latest = await c.runner.getBlockNumber();
  const start = Number(deployment.deployBlock || 0);
  const names = ["ProjectRegistered", "VerificationRecorded", "CreditsIssued", "CreditsBought", "CreditsRetired", "Rechecked", "ProjectFrozen"];
  const events = [];
  let step = 50000;
  for (let from = start; from <= latest; ) {
    const to = Math.min(from + step - 1, latest);
    try {
      for (const name of names) {
        const filter = name === "CreditsRetired" ? c.filters.CreditsRetired(null, projectId) : c.filters[name](projectId);
        const logs = await c.queryFilter(filter, from, to);
        events.push(...logs.map((l) => ({ name, args: l.args, block: l.blockNumber, tx: l.transactionHash, index: l.index })));
      }
      from = to + 1;
    } catch (e) {
      if (step <= 1000) throw e;
      step = Math.floor(step / 5); // the RPC said the range is too big; try smaller pieces
    }
  }
  events.sort((a, b) => a.block - b.block || a.index - b.index);
  const times = {};
  await Promise.all([...new Set(events.map((e) => e.block))].map(async (b) => {
    times[b] = (await c.runner.getBlock(b)).timestamp;
  }));
  return events.map((e) => ({ ...e, time: times[e.block] }));
}

// ------------------------------------------------------------------ refusal reasons in plain words

export function explainError(err) {
  const c = deployment ? new Contract(deployment.address, deployment.abi) : null;
  const data = err?.data || err?.info?.error?.data || err?.error?.data || err?.revert?.data;
  let parsed = err?.revert ? { name: err.revert.name, args: err.revert.args } : null;
  if (!parsed && c && data) {
    try { parsed = c.interface.parseError(typeof data === "string" ? data : data.data); } catch { /* not ours */ }
  }
  if (!parsed) {
    if (err?.code === "ACTION_REJECTED" || err?.code === 4001) return { name: "Cancelled", text: "You cancelled this in MetaMask." };
    if (String(err?.message || "").includes("insufficient funds")) return { name: "NoTestCoins", text: "Your wallet needs a little test POL for fees. Get some free from the Polygon Amoy faucet." };
    return { name: "Error", text: err?.shortMessage || err?.message || "Something went wrong." };
  }
  const a = Array.from(parsed.args || []); // plain array: reading a missing index must not throw
  const credits = (x) => `${Number(x)} credit${Number(x) === 1 ? "" : "s"}`;
  const n = (x) => Number(x);
  const texts = {
    AlreadyClaimed: `Refused: this land is already registered as project GP-${n(a[1])}. The same land cannot be counted twice.`,
    ExceedsVerifiedCredits: `Refused: you asked for ${credits(a[0])}, but the satellites allow only ${n(a[1])} more.`,
    NotEnoughCredits: `Refused: you hold ${n(a[0])} of these credits but tried to use ${n(a[1])}. Retired credits are gone for good.`,
    ProjectIsFrozen: `Refused: project GP-${n(a[0])} is frozen because satellites found forest loss.`,
    AccessControlUnauthorizedAccount: "Refused: only the official satellite verifier can record a check.",
    NotVerified: `Refused: project GP-${n(a[0])} is not Verified, so no credits can be created.`,
    NotProjectOwner: `Refused: only the owner of project GP-${n(a[0])} can do this.`,
    WrongPayment: "Refused: the payment does not match the price.",
    TooManyCells: `Refused: this area has ${n(a[0])} map cells; the limit is ${n(a[1])}.`,
    EmptyBeneficiary: "Please say who this retirement is for.",
    UnknownProject: `There is no project GP-${n(a[0])}.`,
    ZeroAmount: "Please enter at least 1 credit.",
  };
  return { name: parsed.name, text: texts[parsed.name] || `Refused by the contract (${parsed.name}).` };
}

// Send a transaction and report each stage: "wallet" -> "sending" -> "confirmed".
export async function sendTx(promiseFactory, onStage = () => {}) {
  onStage("wallet");
  const tx = await promiseFactory();
  onStage("sending", tx.hash);
  const receipt = await tx.wait();
  onStage("confirmed", tx.hash);
  return receipt;
}
