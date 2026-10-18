// Small shared pieces: status tiles, lifecycle stepper, number tiles, bar chart, QR code.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { STAGES } from "../lib/registry";
import { usePrefs } from "../lib/prefs";
import { Icon } from "./Icon";

export const STATE = {
  pass: { icon: "✓", bg: "bg-leaf", text: "text-leaf", soft: "bg-leaf/10" },
  fail: { icon: "✕", bg: "bg-ember", text: "text-ember", soft: "bg-ember/10" },
  unknown: { icon: "?", bg: "bg-mist", text: "text-mist", soft: "bg-mist/10" },
};

export function StateIcon({ state, size = "w-7 h-7 text-sm" }) {
  const s = STATE[state] || STATE.unknown;
  return <span className={`orb inline-flex items-center justify-center shrink-0 ${size} ${s.bg} text-white font-bold`}>{s.icon}</span>;
}

// Pending -> Verified -> Issued -> Transferred -> Retired, with the counts at each step.
export function Lifecycle({ project }) {
  const { t } = usePrefs();
  const p = project;
  const counts = [
    p.verdict === "None" ? "waiting" : p.verdict === "Verified" ? "done" : p.verdict,
    p.verdict === "Verified" ? `${p.maxCredits} allowed` : "",
    p.issued ? `${p.issued} created` : "",
    p.transferred ? `${p.transferred} moved` : "",
    p.retired ? `${p.retired} retired` : "",
  ];
  return (
    <div>
      <ol className="grid grid-cols-5 gap-1 relative" aria-label="Credit lifecycle">
        {STAGES.map((s, i) => {
          const done = i <= p.stage;
          const current = i === p.stage;
          return (
            <li key={s} className="flex flex-col items-center text-center relative">
              {i > 0 && <span className={`absolute top-[18px] right-1/2 w-full h-[3px] -z-0 ${i <= p.stage ? "bg-leaf" : "bg-line"}`} aria-hidden />}
              <span className={`orb relative z-10 w-9 h-9 inline-flex items-center justify-center font-bold text-sm ${done ? "bg-leaf text-white" : "bg-white text-moss border border-line"} ${current ? "ring-4 ring-leaf/20" : ""}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className={`mt-2 text-xs sm:text-sm font-bold ${done ? "" : "muted"}`}>{t(`stage.${s}`)}</span>
              <span className="text-[11px] muted leading-tight">{counts[i]}</span>
            </li>
          );
        })}
      </ol>
      {p.frozen && <p className="mt-3 text-sm font-bold text-ember flex items-center gap-1.5"><Icon name="lock" className="w-4 h-4" /> Frozen: a later satellite check found forest loss, so the remaining credits cannot be moved.</p>}
      <p className="mt-2 text-xs muted">These rules are in the smart contract, so the website cannot change them: credits cannot be created before Verified, never above the satellite limit, and retired credits are burned.</p>
    </div>
  );
}

export function Kpi({ label, value, sub, tone = "" }) {
  return (
    <div className="panel p-4">
      <div className="text-sm muted">{label}</div>
      <div className={`font-display font-extrabold mt-1 ${typeof value === "string" && value.length > 7 ? "text-xl" : "text-3xl mono"} ${tone}`}>{value}</div>
      {sub && <div className="text-xs muted mt-1">{sub}</div>}
    </div>
  );
}

// Horizontal stacked bars, one per project. Values must be whole numbers.
export function StackedBars({ rows, series }) {
  const max = Math.max(1, ...rows.map((r) => series.reduce((s, x) => s + (r[x.key] || 0), 0)));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm"><span className="font-bold truncate">{r.label}</span><span className="muted mono">{series.reduce((s, x) => s + (r[x.key] || 0), 0)}</span></div>
          <div className="mt-1 h-3.5 rounded-full bg-line/60 overflow-hidden flex" role="img"
               aria-label={series.map((x) => `${x.label} ${r[x.key] || 0}`).join(", ")}>
            {series.map((x) => (r[x.key] ? (
              <span key={x.key} className="h-full bar-grow" title={`${x.label}: ${r[x.key]}`}
                    style={{ width: `${(r[x.key] / max) * 100}%`, background: x.color }} />
            ) : null))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-4 pt-1 text-xs">
        {series.map((x) => <span key={x.key} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: x.color }} />{x.label}</span>)}
      </div>
    </div>
  );
}

export function Qr({ text, size = 132, label }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#173A2B", light: "#FFFFFF" }, errorCorrectionLevel: "M" })
      .then(setSvg).catch(() => setSvg(""));
  }, [text]);
  return (
    <figure className="inline-flex flex-col items-center">
      <div className="rounded-xl bg-white p-2 border border-line shadow-sm" style={{ width: size, height: size }}
           role="img" aria-label={label || `QR code for ${text}`} dangerouslySetInnerHTML={{ __html: svg }} />
      {label && <figcaption className="text-xs muted mt-1 text-center max-w-[160px]">{label}</figcaption>}
    </figure>
  );
}

export function Section({ title, sub, children, right, className = "" }) {
  return (
    <section className={`panel p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          {sub && <p className="text-sm muted mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const date = (t) => (t ? new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
export const dateOnly = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");
