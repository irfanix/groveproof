// Live progress of a check. While waiting we show the steps in order;
// when the answer arrives we show the real time each step took.
import { useEffect, useState } from "react";

const EXPECTED = [
  "Checking the land register on the blockchain",
  "Finding satellite images",
  "Removing clouds",
  "Mapping forest and comparing",
  "Calculating credits",
  "Writing the explanation",
];

export default function Progress({ running, timings }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!running) return;
    setI(0);
    const t = setInterval(() => setI((x) => Math.min(x + 1, EXPECTED.length - 1)), 2600);
    return () => clearInterval(t);
  }, [running]);

  if (running) {
    return (
      <ol className="space-y-2" aria-live="polite">
        {EXPECTED.map((label, k) => (
          <li key={label} className={`flex items-center gap-3 ${k > i ? "text-moss/60" : ""}`}>
            <span className={`hex w-5 h-5 shrink-0 ${k < i ? "bg-leaf" : k === i ? "bg-canopy working" : "bg-line"}`} />
            {label}{k === i && "…"}
          </li>
        ))}
      </ol>
    );
  }
  if (!timings?.length) return null;
  const total = timings.reduce((s, t) => s + t.seconds, 0);
  return (
    <ol className="space-y-1.5 text-sm">
      {timings.map((t) => (
        <li key={t.label} className="flex items-center gap-3">
          <span className="hex w-4 h-4 bg-leaf shrink-0" />
          <span className="flex-1">{t.label}</span>
          <span className="mono muted">{t.seconds.toFixed(1)} s</span>
        </li>
      ))}
      <li className="flex justify-end pt-1 font-bold mono">Total {total.toFixed(1)} s</li>
    </ol>
  );
}
