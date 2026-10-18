// The verdict "stamp": one clear answer, the reason, and the key numbers.
// Every number is a button: press it and the line that produced it lights up.
import { useState } from "react";
import { Orb, VERDICTS } from "./Verdict";
import { showProof } from "../lib/proof";

function Stat({ label, value, unit, proof }) {
  return (
    <button type="button" onClick={() => showProof(proof)}
      className="choice text-left rounded-xl -m-2 p-2 hover:bg-leaf/5 group/stat" title="Show where this number comes from">
      <div className="muted text-sm">{label}</div>
      <div className="font-display text-2xl font-bold mono">
        {value}<span className="text-base font-body font-normal muted"> {unit}</span>
      </div>
      <div className="text-xs text-leaf opacity-0 group-hover/stat:opacity-100 transition-opacity">Show the proof ↓</div>
    </button>
  );
}

function shareText(payload, name) {
  const r = payload.result;
  const v = VERDICTS[r.verdict];
  const lines = [`GroveProof check: ${name}`, `Result: ${v.label}. ${r.reason}`];
  if (r.verdict === "Verified") lines.push(`Credits allowed: ${r.credits.credits} (1 credit = 1 tonne CO2)`);
  if (payload.recipe_hash) lines.push(`Recipe fingerprint: ${payload.recipe_hash}`);
  lines.push(window.location.origin);
  return lines.join("\n");
}

export default function VerdictCard({ payload, name = "Forest" }) {
  const r = payload.result;
  const v = VERDICTS[r.verdict];
  const n = r.numbers;
  const full = r.verdict !== "AlreadyClaimed";
  const [copied, setCopied] = useState(false);
  const text = shareText(payload, name);

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  return (
    <section className={`panel border-2 ${v.ring} p-5`} aria-live="polite">
      <div className="flex items-center gap-4">
        <Orb className={`orb-big stamp-in ${v.bg} text-white w-20 h-20 text-3xl font-bold shrink-0`}>{v.icon}</Orb>
        <div>
          <h2 className={`text-3xl font-extrabold ${v.color}`}>{v.label}</h2>
          <p className="muted">{v.next}</p>
        </div>
      </div>
      <p className="mt-4 text-lg leading-relaxed">{r.reason}</p>

      {full && (
        <>
          <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-line">
            <Stat label="Forest now" value={n.forest_after_ha} unit="ha" proof="proof-forest" />
            <Stat label="Tree loss" value={n.loss_pct} unit="%" proof="proof-forest" />
            <Stat label="Seen clearly (no cloud)" value={n.clear_pct} unit="%" proof="proof-clear" />
            <Stat label="Credits allowed" value={r.credits.credits} unit="t CO₂" proof={r.verdict === "Verified" ? "proof-credits" : "proof-rules"} />
          </div>
          <p className="text-sm muted mt-3">Every number here was calculated by code from satellite pixels. Press a number to see how.</p>
        </>
      )}
      {payload.cached && (
        <p className="mt-4 text-sm muted">Saved result, computed on {payload.checked_at}. Press “Check again live” for a fresh satellite check.</p>
      )}
      <div className="flex flex-wrap gap-2 mt-5">
        <a className="btn-quiet" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        <button className="btn-quiet" onClick={copy}>{copied ? "Copied" : "Copy result"}</button>
      </div>
    </section>
  );
}
