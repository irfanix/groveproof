// Live progress of a check. While waiting we show a running clock, a bar and the steps in order,
// paced to how long a real satellite check usually takes. When the answer arrives we show the
// real time each step took.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

// [label, second at which this step usually starts during a live check]
const LIVE = [
  ["Checking the land register on the blockchain", 0],
  ["Finding satellite images", 2],
  ["Downloading pictures and removing clouds", 6],
  ["Mapping forest and comparing before with after", 50],
  ["Calculating credits", 70],
  ["Writing the explanation", 72],
];
const LIVE_TOTAL = 80;

function clock(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Progress({ running, timings, live }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!running) return;
    setSec(0);
    const t = setInterval(() => setSec((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (running) {
    const scale = live ? 1 : 0.02;               // a saved result opens in about a second
    let i = 0;
    LIVE.forEach(([, start], k) => { if (sec >= start * scale) i = k; });
    const pct = Math.min(95, (sec / (LIVE_TOTAL * scale)) * 100);
    const left = Math.max(0, Math.round(LIVE_TOTAL * scale - sec));
    return (
      <div className="progress-card space-y-3 rounded-2xl p-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="sat-orbit shrink-0" aria-hidden><span className="sat text-[#1F6B47]"><Icon name="satellite" className="w-6 h-6" /></span></span>
          <div className="flex-1">
            <div className="font-bold">{live ? "Live satellite check" : "Opening saved result"}</div>
            <div className="text-sm muted">Step {i + 1} of {LIVE.length}: {LIVE[i][0]}</div>
          </div>
          <span className="mono font-bold text-2xl">{clock(sec)}</span>
        </div>
        <div className="h-3 rounded-full bg-line overflow-hidden">
          <div className="h-full rounded-full bar-stripes" style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
        {live && (
          <p className="text-sm">
            {left > 0 ? <>About <b>{clock(left)}</b> left.</> : <>Almost done, finishing the last step.</>}{" "}
            <span className="muted">Real satellite pictures are being downloaded and cleaned, so a live check takes about 1 to 2 minutes. Please keep this page open.</span>
            {sec > 240 && <b className="block mt-1">It is taking longer than usual: the satellite service may be busy. You can wait, or try a saved sample.</b>}
          </p>
        )}
        <ol className="space-y-2">
          {LIVE.map(([label], k) => (
            <li key={label} className={`flex items-center gap-3 ${k > i ? "text-moss/60" : ""}`}>
              <span className={`orb w-6 h-6 shrink-0 inline-flex items-center justify-center text-white text-[10px] ${k < i ? "bg-leaf" : k === i ? "bg-[#3C8A62] orb-working" : "bg-line"}`}>
                {k < i ? "✓" : k === i ? "" : k + 1}
              </span>
              <span className={k === i ? "font-bold" : ""}>{label}{k === i && "…"}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (!timings?.length) return null;
  const total = timings.reduce((s, t) => s + t.seconds, 0);
  return (
    <ol className="space-y-1.5 text-sm">
      {timings.map((t) => (
        <li key={t.label} className="flex items-center gap-3">
          <span className="orb w-5 h-5 bg-leaf shrink-0 inline-flex items-center justify-center text-white text-[9px]">✓</span>
          <span className="flex-1">{t.label}</span>
          <span className="mono muted">{t.seconds.toFixed(1)} s</span>
        </li>
      ))}
      <li className="flex justify-end pt-1 font-bold mono">Total {total.toFixed(1)} s</li>
    </ol>
  );
}
