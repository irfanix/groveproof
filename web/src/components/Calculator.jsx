// Emissions calculator: monthly fuel and electricity -> tonnes of CO2 per year -> credits needed.
// Factors are published defaults, shown on screen so anyone can check them.
import { useState } from "react";
import { Link } from "react-router-dom";

export const FACTORS = [
  { key: "kwh", label: "Electricity from the grid", unit: "kWh per month", kg: 0.727, src: "India grid average 2023-24, Central Electricity Authority CO₂ Baseline Database" },
  { key: "diesel", label: "Diesel", unit: "litres per month", kg: 2.68, src: "IPCC 2006 default for diesel (74.1 t CO₂ per TJ)" },
  { key: "petrol", label: "Petrol", unit: "litres per month", kg: 2.27, src: "IPCC 2006 default for petrol (69.3 t CO₂ per TJ)" },
  { key: "lpg", label: "LPG", unit: "kg per month", kg: 2.98, src: "IPCC 2006 default for LPG (63.1 t CO₂ per TJ)" },
];

export default function Calculator({ onResult }) {
  const [v, setV] = useState({ kwh: 12000, diesel: 400, petrol: 150, lpg: 60 });
  const perYear = FACTORS.map((f) => ({ ...f, t: ((Number(v[f.key]) || 0) * f.kg * 12) / 1000 }));
  const total = perYear.reduce((s, x) => s + x.t, 0);
  const credits = Math.ceil(total);
  const max = Math.max(0.0001, ...perYear.map((x) => x.t));
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        {FACTORS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="font-bold">{f.label}</span> <span className="muted">({f.unit})</span>
            <input className="field mt-1" type="number" min="0" value={v[f.key]}
                   onChange={(e) => { const nv = { ...v, [f.key]: e.target.value }; setV(nv); onResult?.(nv); }} />
          </label>
        ))}
      </div>
      <div className="rounded-2xl bg-canopy text-white p-5 flex flex-col">
        <div className="text-sm text-[#CFE6D7]">Your yearly emissions</div>
        <div className="font-display text-5xl font-extrabold mono">{total.toFixed(1)} <span className="text-2xl">t CO₂</span></div>
        <div className="mt-4 space-y-2">
          {perYear.map((x) => (
            <div key={x.key}>
              <div className="flex justify-between text-sm"><span>{x.label}</span><span className="mono">{x.t.toFixed(1)} t</span></div>
              <div className="h-2 rounded-full bg-white/10 mt-1"><div className="h-2 rounded-full bg-[#B4DA4E] bar-grow" style={{ width: `${(x.t / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-white/15">
          <div className="text-sm text-[#CFE6D7]">To balance one year you would retire</div>
          <div className="font-display text-3xl font-extrabold">{credits} credits</div>
          <p className="text-xs text-[#CFE6D7] mt-1">Cut your own emissions first. Credits are for what you cannot avoid yet.</p>
          <Link to="/credits" className="btn-main mt-3 !bg-white !text-canopy">Go to the marketplace</Link>
        </div>
      </div>
      <details className="lg:col-span-2 text-xs muted">
        <summary className="cursor-pointer font-bold">Where these factors come from</summary>
        <ul className="mt-2 space-y-1">{FACTORS.map((f) => <li key={f.key}>{f.label}: {f.kg} kg CO₂ per unit. {f.src}.</li>)}</ul>
      </details>
    </div>
  );
}
