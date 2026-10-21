// One shared picture of everything on the blockchain: every project, every event, who holds
// which credits, and what stage each credit batch has reached. Read once, cached for 30 s,
// and used by the dashboard, the credit passport, the map, the charts, alerts and the assistant.
import { ZeroAddress } from "ethers";
import { contractLogs, deployment, listProjects, parseMeta, reader } from "./chain";

const NAMES = ["ProjectRegistered", "VerificationRecorded", "CreditsIssued", "CreditsBought", "CreditsRetired", "Rechecked", "ProjectFrozen", "TransferSingle"];
export const STAGES = ["Pending", "Verified", "Issued", "Transferred", "Retired"];
const YEAR = 365 * 86400;

let cache = null;
let cacheAt = 0;
let inflight = null;

async function readAllEvents() {
  const c = reader();
  const latest = await c.runner.getBlockNumber();
  const start = Number(deployment.deployBlock || 0);
  const out = (await contractLogs(start, latest)).filter((e) => NAMES.includes(e.name));
  out.sort((a, b) => a.block - b.block || a.index - b.index);
  const times = {};
  await Promise.all([...new Set(out.map((e) => e.block))].map(async (b) => { times[b] = (await c.runner.getBlock(b)).timestamp; }));
  return out.map((e) => ({ ...e, time: times[e.block] }));
}

function projectIdOf(e) {
  if (e.name === "TransferSingle") return Number(e.args.id);
  if (e.name === "CreditsRetired") return Number(e.args.projectId);
  return Number(e.args.projectId ?? e.args[0]);
}

// Work out stage, holders, sales and retirements for one project from its events.
function summarise(p, events) {
  const meta = parseMeta(p.metadataURI);
  const reg = events.find((e) => e.name === "ProjectRegistered");
  const balances = {};
  let transferred = 0;
  const transfers = [];
  for (const e of events.filter((x) => x.name === "TransferSingle")) {
    const from = e.args.from, to = e.args.to, v = Number(e.args.value);
    if (from !== ZeroAddress) balances[from] = (balances[from] || 0) - v;
    if (to !== ZeroAddress) balances[to] = (balances[to] || 0) + v;
    if (from !== ZeroAddress && to !== ZeroAddress) { transferred += v; transfers.push({ from, to, amount: v, time: e.time, tx: e.tx }); }
  }
  const holders = Object.entries(balances).filter(([, v]) => v > 0)
    .map(([address, amount]) => ({ address, amount, isOwner: address.toLowerCase() === p.owner.toLowerCase() }))
    .sort((a, b) => b.amount - a.amount);
  const sales = events.filter((e) => e.name === "CreditsBought").map((e) => ({ buyer: e.args.buyer, seller: e.args.seller, amount: Number(e.args.amount), paid: e.args.paid, time: e.time, tx: e.tx }));
  const retirements = events.filter((e) => e.name === "CreditsRetired").map((e) => ({ id: Number(e.args.retirementId), by: e.args.by, amount: Number(e.args.amount), beneficiary: e.args.beneficiary, time: e.time, tx: e.tx }));
  const lastCheck = [...events].reverse().find((e) => e.name === "VerificationRecorded" || e.name === "Rechecked");

  let stage = 0;
  if (p.verdict === "Verified") stage = 1;
  if (p.issued > 0) stage = 2;
  if (transferred > 0) stage = 3;
  if (p.retired > 0) stage = 4;

  return {
    ...p,
    name: meta.name || `Project ${p.id}`,
    checkId: meta.checkId && meta.checkId.length > 3 ? meta.checkId : null,
    cells: reg ? Array.from(reg.args.cells).map((c) => BigInt(c).toString(16)) : [],
    registeredAt: reg?.time || null,
    lastCheckAt: lastCheck?.time || null,
    events,
    holders,
    sales,
    transfers,
    transferred,
    soldAmount: sales.reduce((s, x) => s + x.amount, 0),
    retirements,
    stage,
    stageName: STAGES[stage],
    available: Math.max(0, p.issued - p.retired),
    pendingCredits: p.verdict === "Verified" ? Math.max(0, p.maxCredits - p.issued) : 0,
  };
}

export async function loadRegistry(force = false) {
  if (!deployment) throw new Error("The contract is not deployed yet.");
  if (!force && cache && Date.now() - cacheAt < 30000) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const [projects, events] = await Promise.all([listProjects(), readAllEvents()]);
    const byProject = {};
    for (const e of events) {
      const id = projectIdOf(e);
      (byProject[id] ||= []).push(e);
    }
    const list = projects.map((p) => summarise(p, byProject[p.id] || []));
    const totals = {
      projects: list.length,
      verified: list.filter((p) => p.verdict === "Verified").length,
      issued: list.reduce((s, p) => s + p.issued, 0),
      retired: list.reduce((s, p) => s + p.retired, 0),
      pending: list.reduce((s, p) => s + p.pendingCredits, 0),
      frozen: list.filter((p) => p.frozen).reduce((s, p) => s + p.available, 0),
      transferred: list.reduce((s, p) => s + p.transferred, 0),
    };
    cache = { projects: list, events, totals, loadedAt: Date.now() };
    cacheAt = Date.now();
    return cache;
  })();
  try { return await inflight; } finally { inflight = null; }
}

export const findProject = (reg, id) => reg.projects.find((p) => p.id === Number(id));

export function holdingsOf(reg, address) {
  if (!address) return [];
  const a = address.toLowerCase();
  return reg.projects.map((p) => ({ project: p, amount: p.holders.find((h) => h.address.toLowerCase() === a)?.amount || 0 }))
    .filter((x) => x.amount > 0);
}

export const retirementsBy = (reg, address) =>
  reg.projects.flatMap((p) => p.retirements.map((r) => ({ ...r, project: p }))).filter((r) => !address || r.by.toLowerCase() === address.toLowerCase());

export const projectsOwnedBy = (reg, address) =>
  reg.projects.filter((p) => address && p.owner.toLowerCase() === address.toLowerCase());

// ------------------------------------------------------------------ trust checks
// Separate checks, each passed / failed / unknown, with a reason in plain words.
// There is deliberately no single "100% trusted" score.
export function trustChecks(p, { evidence = null, check = null, rerun = null } = {}) {
  const now = Date.now() / 1000;
  const items = [];
  const add = (key, title, state, why) => items.push({ key, title, state, why });

  add("once", "Land counted only once", "pass", `The smart contract stores ${p.cellCount} map cells for this forest and refuses any project that overlaps them.`);

  if (p.verdict === "Verified") add("satellite", "Independent satellite check", "pass", "Sentinel-2 pictures show healthy forest, recorded on-chain by the verifier.");
  else if (p.verdict === "NeedsReview") add("satellite", "Independent satellite check", "unknown", "The satellite evidence was not strong enough yet. A person must look before credits can be created.");
  else if (p.verdict === "NotEligible") add("satellite", "Independent satellite check", "fail", "Satellites showed tree loss, or the land is mostly not forest.");
  else if (p.verdict === "CantCheckYet") add("satellite", "Independent satellite check", "unknown", "Clouds hid too much of the land. It needs a new check.");
  else add("satellite", "Independent satellite check", "unknown", "No satellite check has been recorded yet.");

  if (rerun === true) add("rerun", "Result can be reproduced", "pass", "You re-ran the exact recipe and got the same result as the blockchain record.");
  else if (rerun === false) add("rerun", "Result can be reproduced", "fail", "Re-running the recipe gave a different result from the blockchain record.");
  else add("rerun", "Result can be reproduced", "unknown", "Not re-run yet. Anyone can re-run the exact recipe from this page.");

  if (p.frozen) add("permanence", "Forest still standing", "fail", `A later check found ${p.lastLossBps / 100}% tree loss, so the remaining credits are frozen.`);
  else if (!p.lastCheckAt) add("permanence", "Forest still standing", "unknown", "There is no satellite check yet.");
  else if (now - p.lastCheckAt > YEAR) add("permanence", "Forest still standing", "unknown", "The last satellite check is more than a year old. A new check is due.");
  else add("permanence", "Forest still standing", "pass", "Checked by satellites within the last year with no major loss.");

  const rev = evidence?.review;
  if (rev?.decision === "approved") add("review", "Human review of evidence", "pass", `${rev.reviewer} approved the evidence on ${rev.at}.`);
  else if (rev?.decision === "rejected") add("review", "Human review of evidence", "fail", `${rev.reviewer} rejected the evidence: ${rev.note || "no reason given"}.`);
  else if (rev?.decision === "more_needed") add("review", "Human review of evidence", "unknown", `${rev.reviewer} asked for more evidence.`);
  else add("review", "Human review of evidence", "unknown", "No independent reviewer has looked at the owner's evidence yet.");

  const have = evidence?.completeness?.have || 0;
  const of = evidence?.completeness?.of || 4;
  add("evidence", "Evidence complete", have === of ? "pass" : "unknown",
    have === of ? "Photos, reports, monitoring data and a location file are all on record." : `${have} of ${of} kinds of evidence are on record (photos, reports, monitoring data, location).`);

  const high = (evidence?.flags || []).filter((f) => f.level === "high").length;
  if (high) add("flags", "No serious warnings", "fail", `${high} serious warning${high > 1 ? "s" : ""} need a person to look (see the evidence list).`);
  else if (evidence) add("flags", "No serious warnings", "pass", "The automatic checks found no serious warning in the evidence.");

  add("used", "No credit used twice", "pass", `Retired credits are burned by the contract, so they can never be sold or retired again. ${p.retired} retired so far.`);
  add("registry", "Listed in an official registry", "unknown", "Not listed with Verra or Gold Standard. GroveProof is a prototype that makes checks transparent; it is not a certified standard.");
  add("additionality", "Would the forest be lost without this project?", "unknown", "This is called additionality. Satellites cannot prove it; it needs local evidence and expert judgement.");

  const count = (s) => items.filter((x) => x.state === s).length;
  return { items, passed: count("pass"), failed: count("fail"), unknown: count("unknown") };
}

// ------------------------------------------------------------------ alerts
export function alertsFor(reg, { role, address, prefs }) {
  const now = Date.now() / 1000;
  const out = [];
  const on = (k) => !prefs || prefs.notify?.[k] !== false;
  const mine = new Set([
    ...projectsOwnedBy(reg, address).map((p) => p.id),
    ...holdingsOf(reg, address).map((h) => h.project.id),
  ]);
  for (const p of reg.projects) {
    const relevant = role === "public" || role === "verifier" || mine.has(p.id) || !address;
    if (!relevant) continue;
    if (p.frozen && on("status")) out.push({ level: "high", kind: "status", project: p.id, text: `GP-${p.id} ${p.name} is frozen: satellites found ${p.lastLossBps / 100}% tree loss.` });
    if (p.verdict === "NeedsReview" && on("status")) out.push({ level: "medium", kind: "status", project: p.id, text: `GP-${p.id} needs a person to review its evidence.` });
    if (p.verdict === "None" && on("reports")) out.push({ level: "medium", kind: "reports", project: p.id, text: `GP-${p.id} ${p.name} has no satellite check yet.` });
    if (p.lastCheckAt && now - p.lastCheckAt > YEAR * 0.9 && !p.frozen && on("expiry")) out.push({ level: "medium", kind: "expiry", project: p.id, text: `GP-${p.id}: the last satellite check is almost a year old. A new check is due soon.` });
    for (const t of p.transfers) {
      if (p.issued && t.amount >= Math.max(10, p.issued * 0.5) && now - t.time < 30 * 86400 && on("unusual")) {
        out.push({ level: "medium", kind: "unusual", project: p.id, text: `Large transfer: ${t.amount} of ${p.issued} GP-${p.id} credits moved in one transaction.` });
      }
    }
  }
  return out;
}
