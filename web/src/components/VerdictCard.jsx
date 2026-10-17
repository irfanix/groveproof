// The verdict "stamp": one clear answer, the reason, and the key numbers.
import { Hex, VERDICTS } from "./Verdict";

function Stat({ label, value, unit }) {
  return (
    <div>
      <div className="muted text-sm">{label}</div>
      <div className="font-display text-2xl font-bold mono">
        {value}<span className="text-base font-body font-normal muted"> {unit}</span>
      </div>
    </div>
  );
}

export default function VerdictCard({ payload }) {
  const r = payload.result;
  const v = VERDICTS[r.verdict];
  const n = r.numbers;
  const full = r.verdict !== "AlreadyClaimed";
  return (
    <section className={`panel border-2 ${v.ring} p-5`} aria-live="polite">
      <div className="flex items-center gap-4">
        <Hex className={`stamp-in ${v.bg} text-white w-20 h-20 text-3xl font-bold shrink-0`}>{v.icon}</Hex>
        <div>
          <h2 className={`text-3xl font-extrabold ${v.color}`}>{v.label}</h2>
          <p className="muted">{v.next}</p>
        </div>
      </div>
      <p className="mt-4 text-lg leading-relaxed">{r.reason}</p>

      {full && (
        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-line">
          <Stat label="Forest now" value={n.forest_after_ha} unit="ha" />
          <Stat label="Tree loss" value={n.loss_pct} unit="%" />
          <Stat label="Seen clearly (no cloud)" value={n.clear_pct} unit="%" />
          <Stat label="Credits allowed" value={r.credits.credits} unit="t CO₂" />
        </div>
      )}
      {payload.cached && (
        <p className="mt-4 text-sm muted">Saved result, computed on {payload.checked_at}. Press “Check again live” for a fresh satellite check.</p>
      )}
    </section>
  );
}
