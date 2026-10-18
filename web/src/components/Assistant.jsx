// "Ask GroveProof": a small assistant drawer. Common questions are answered straight from the
// blockchain records and the evidence store (no AI needed, so the answers are always exact).
// Other questions go to an AI model if one is connected, with the same number guard as the
// explanations; otherwise the assistant says what it can answer.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { askAssistant, getEvidence } from "../lib/api";
import { hasChain, short } from "../lib/chain";
import { findProject, loadRegistry, trustChecks } from "../lib/registry";
import { usePrefs } from "../lib/prefs";
import { Icon, IconTile } from "./Icon";

const GENERAL = [
  ["what", "What does GroveProof check?"],
  ["trust", "How do I check whether credits are trustworthy?"],
  ["retire", "What does retiring a credit mean?"],
  ["chain", "Can the blockchain prove a photo is true?"],
];
const PROJECT = [
  ["pending", "Why is this project still pending?"],
  ["trusty", "Can I trust these credits?"],
  ["missing", "What evidence is missing?"],
  ["owner", "Who owns these credits now?"],
  ["used", "Have they been sold or retired?"],
];

function projectAnswer(key, p, ev) {
  const trust = trustChecks(p, { evidence: ev });
  const link = <Link className="underline" to={`/lookup?q=GP-${p.id}`}>GP-{p.id} passport</Link>;
  switch (key) {
    case "pending": {
      if (p.frozen) return <>GP-{p.id} is not pending, it is <b>frozen</b>: a later satellite check found {p.lastLossBps / 100}% tree loss, so the remaining credits cannot move.</>;
      if (p.verdict === "None") return <>GP-{p.id} is pending because <b>no satellite check has been recorded yet</b>. The owner should run “Check a forest” and record the result. Until then the contract will not create any credits.</>;
      if (p.verdict === "NeedsReview") return <>GP-{p.id} is pending because the satellite evidence was <b>not strong enough</b> (for example a small loss, or unsure pixels). A person must review photos and reports first. {ev?.items?.length ? `${ev.items.length} files are on record.` : "No ground evidence is on record yet."}</>;
      if (p.verdict === "CantCheckYet") return <>Clouds hid too much of the land, so GP-{p.id} <b>could not be checked yet</b>. A new check with other dates is needed.</>;
      if (p.verdict === "NotEligible") return <>GP-{p.id} is <b>not eligible</b>: satellites showed tree loss, or the land is mostly not forest. No credits can be created.</>;
      if (p.issued === 0) return <>GP-{p.id} is Verified for up to {p.maxCredits} credits, but the owner <b>has not created them yet</b>.</>;
      return <>GP-{p.id} is not pending. It is at the <b>{p.stageName}</b> stage: {p.issued} credits created, {p.retired} retired. See the {link}.</>;
    }
    case "trusty":
      return <>{trust.passed} checks passed, {trust.failed} failed and {trust.unknown} are unknown. {trust.failed ? <>Look at the failed ones first: {trust.items.filter((x) => x.state === "fail").map((x) => x.title).join(", ")}.</> : "Nothing failed."} Unknown does not mean bad: it means nobody has proven it yet (for example additionality). Open the {link} to see every reason.</>;
    case "missing": {
      if (!ev) return <>The evidence store could not be reached right now.</>;
      const missing = Object.keys(ev.kinds).filter((k) => !ev.kinds_present.includes(k)).map((k) => ev.kinds[k].toLowerCase());
      const high = ev.flags.filter((f) => f.level === "high");
      return <>{missing.length ? <>Missing: <b>{missing.join(", ")}</b>.</> : "All four kinds of evidence are on record."} {high.length ? <>There {high.length > 1 ? "are" : "is"} {high.length} serious warning{high.length > 1 ? "s" : ""}: {high[0].text}</> : "No serious warnings."} {ev.review ? `Last review: ${ev.review.decision.replace("_", " ")} by ${ev.review.reviewer}.` : "No reviewer has looked yet."}</>;
    }
    case "owner":
      return p.holders.length ? <>{p.holders.slice(0, 3).map((h) => `${short(h.address)} holds ${h.amount}${h.isOwner ? " (project owner)" : ""}`).join("; ")}. {p.retired ? `${p.retired} retired credits belong to nobody: they were burned.` : ""}</> : <>Nobody yet: no credits have been created for GP-{p.id}.</>;
    case "used":
      return <>{p.soldAmount} sold, {p.transferred - p.soldAmount} moved between wallets, and {p.retired} retired{p.retirements.length ? ` on ${p.retirements.length} certificate(s): ${p.retirements.map((r) => `R-${r.id} for ${r.beneficiary}`).join(", ")}` : ""}. A retired credit is burned, so it can never be used again.</>;
    default: return null;
  }
}

function generalAnswer(key) {
  switch (key) {
    case "what": return <>GroveProof checks a forest with free Sentinel-2 satellite pictures, removes clouds, maps the trees and compares before with after. Code calculates the credits; a smart contract creates them only up to what the satellites allow, and never twice for the same land.</>;
    case "trust": return <>Open the credit's passport (Look up a credit, or scan its QR code). Read the four answers at the top, then the trust checks: each one says passed, failed or unknown, with the reason. In Expert tools you can re-run the exact satellite check yourself.</>;
    case "retire": return <>Retiring means using a credit for a climate claim. The contract burns it and writes a certificate (like R-1) with who it was for. A burned credit can never be sold or retired again.</>;
    case "chain": return <>No. The blockchain stops records from being changed later, but it cannot prove a photo, a sensor reading or a claim is true. That is why satellites, automatic warnings and a human reviewer check the evidence before anything is approved.</>;
    default: return null;
  }
}

export default function Assistant() {
  const { t } = usePrefs();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState({ p: null, ev: null });
  const end = useRef(null);

  const pid = useMemo(() => {
    const m = new URLSearchParams(loc.search).get("q")?.match(/^GP-?(\d+)$/i);
    return m && loc.pathname === "/lookup" ? Number(m[1]) : null;
  }, [loc]);

  useEffect(() => {
    if (!open || !pid || !hasChain()) { setCtx({ p: null, ev: null }); return; }
    loadRegistry().then((reg) => {
      const p = findProject(reg, pid);
      setCtx({ p, ev: null });
      if (p) getEvidence(p.id, p.checkId).then((ev) => setCtx({ p, ev })).catch(() => {});
    }).catch(() => {});
  }, [open, pid]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const say = (q, a) => setMsgs((m) => [...m, { who: "you", text: q }, { who: "bot", text: a }]);
  const chips = ctx.p ? PROJECT : GENERAL;

  function pick(key, label) {
    const a = ctx.p ? projectAnswer(key, ctx.p, ctx.ev) : generalAnswer(key);
    say(label, a);
  }

  async function ask(e) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setText("");
    // 1. Common questions are answered from the records
    const low = q.toLowerCase();
    const match = [...PROJECT, ...GENERAL].find(([k]) => (
      (k === "pending" && /pending|waiting|why.*not/.test(low)) || (k === "missing" && /missing|evidence|proof/.test(low)) ||
      (k === "owner" && /own|holder|who has/.test(low)) || (k === "used" && /sold|retir|used/.test(low)) ||
      (k === "trusty" && /trust|genuine|real|fake/.test(low)) || (k === "chain" && /photo|blockchain prove/.test(low))
    ));
    if (match && (ctx.p || GENERAL.some(([k]) => k === match[0]))) {
      const a = ctx.p && PROJECT.some(([k]) => k === match[0]) ? projectAnswer(match[0], ctx.p, ctx.ev) : generalAnswer(match[0]);
      if (a) { say(q, a); return; }
    }
    // 2. Anything else: an AI model, if connected, using only these facts
    setMsgs((m) => [...m, { who: "you", text: q }]);
    setBusy(true);
    const facts = ctx.p ? {
      project: `GP-${ctx.p.id}`, name: ctx.p.name, verdict: ctx.p.verdict, stage: ctx.p.stageName, frozen: ctx.p.frozen,
      credits_allowed: ctx.p.maxCredits, created: ctx.p.issued, retired: ctx.p.retired, sold: ctx.p.soldAmount,
      evidence_files: ctx.ev?.items?.length ?? null, evidence_review: ctx.ev?.review?.decision ?? "none",
    } : { app: "GroveProof checks forests with Sentinel-2 satellites; a smart contract creates carbon credits only up to what satellites show; land counts once; retired credits are burned." };
    try {
      const r = await askAssistant(q, facts);
      setMsgs((m) => [...m, { who: "bot", text: r.answer, ai: true }]);
    } catch (err) {
      setMsgs((m) => [...m, { who: "bot", text: <>I can answer the questions below exactly from the records. {String(err.message).includes("No AI") ? "Free questions need an AI model, which is not connected on this checker." : err.message}</> }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={() => setOpen(!open)} className="assist-fab fixed z-[1100] right-4 bottom-24 sm:bottom-6 rounded-full bg-canopy text-white pl-4 pr-5 h-14 font-bold flex items-center gap-2" aria-expanded={open}>
        <Icon name="sparkle" className="w-6 h-6" />{t("assist.title")}
      </button>
      {open && (
        <div className="assist-panel fixed z-[1100] right-4 bottom-40 sm:bottom-24 w-[min(420px,calc(100vw-2rem))] max-h-[70vh] flex flex-col rounded-3xl bg-white border border-line" role="dialog" aria-label={t("assist.title")}>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-3"><IconTile name="sparkle" size="md" tone="solid" /><div>
              <div className="font-bold">{t("assist.title")}</div>
              <div className="text-xs muted">{ctx.p ? `About GP-${ctx.p.id} ${ctx.p.name}` : "General questions"} · answers come from the records</div>
            </div></div>
            <button className="text-2xl muted px-2" onClick={() => setOpen(false)} aria-label={t("common.close")}>×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {msgs.length === 0 && <p className="muted">Pick a question, or type your own.{!ctx.p && " Open a credit passport to ask about one project."}</p>}
            {msgs.map((m, i) => (
              <div key={i} className={m.who === "you" ? "flex justify-end" : ""}>
                <div className={`rounded-2xl px-3 py-2 max-w-[85%] ${m.who === "you" ? "bg-canopy text-white" : "bg-lichen"}`}>
                  {m.text}
                  {m.ai && <div className="text-[11px] muted mt-1">Written by AI from the records. Every number was checked.</div>}
                </div>
              </div>
            ))}
            {busy && <div className="bg-lichen rounded-2xl px-3 py-2 w-fit">Thinking…</div>}
            <div ref={end} />
          </div>
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {chips.map(([k, label]) => <button key={k} className="chip text-xs" onClick={() => pick(k, label)}>{label}</button>)}
          </div>
          <form onSubmit={ask} className="p-3 border-t border-line flex gap-2">
            <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("assist.placeholder")} />
            <button className="btn-main" disabled={busy}>{t("assist.send")}</button>
          </form>
        </div>
      )}
    </>
  );
}
