// Intro page: what GroveProof is, in one look.
//  - Hero with a 3D "credit card" that tilts with the mouse (user-triggered motion only)
//  - Four questions every carbon credit must answer, each with GroveProof's evidence
//  - An audit trail that draws itself once when scrolled into view
// All motion respects "reduce motion" settings.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Hex, VERDICTS } from "../components/Verdict";
import HeroScene from "../components/HeroScene";
import Brush from "../components/Brush";
import { IconTile } from "../components/Icon";
import { recentChecks, timeAgo } from "../lib/history";
import { usePrefs } from "../lib/prefs";
import { useReveal } from "../lib/reveal";

// Held-out accuracy of the trained forest model (models/forest_rf.json). Update if you retrain.
const MODEL_ACCURACY = "93.1%";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

// ------------------------------------------------------------------ the tilting credit card

// A small field of hexagons standing in for the forest's map cells.
const CELLS = (() => {
  const out = [];
  const w = 26, h = 22.5;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 8; c++) {
      const x = 18 + c * w + (r % 2 ? w / 2 : 0);
      const y = 18 + r * h;
      // carve a forest-like shape out of the grid
      const inside = !((r === 0 && (c < 2 || c > 5)) || (r === 5 && (c < 1 || c > 4)) || (c === 7 && r > 2));
      if (inside) out.push({ x, y, k: r * 8 + c });
    }
  }
  return out;
})();

function hexPoints(cx, cy, s = 12) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function CreditCard() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  // The card rests tilted, and tilts further with the mouse.
  const REST = { rx: 7, ry: -14, gx: 30, gy: 20, active: false };
  const [t, setT] = useState(REST);

  function move(e) {
    if (reduced || e.pointerType === "touch") return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setT({ rx: REST.rx + (0.5 - py) * 14, ry: REST.ry + (px - 0.5) * 22, gx: px * 100, gy: py * 100, active: true });
  }
  const leave = () => setT(REST);

  return (
    <div className="relative [perspective:1100px]" onPointerMove={move} onPointerLeave={leave}>
      {/* soft shadow in the card's own colours, drifting away from the light */}
      <div
        aria-hidden
        className="card-shadow pointer-events-none absolute -inset-x-2 top-16 -bottom-8 rounded-[40px]"
        style={{
          transform: `translate(${-t.ry * 1.6}px, ${t.rx * 1.6 + 22}px) scale(${t.active ? 1.04 : 0.98})`,
          transition: t.active ? "transform 80ms linear" : "transform 700ms cubic-bezier(.2,.8,.2,1)",
        }}
      />
      <div
        ref={ref}
        className="relative rounded-[28px] bg-canopy text-white p-6 sm:p-7 shadow-[0_2px_0_rgba(255,255,255,0.06)_inset,0_24px_40px_-24px_rgba(23,58,43,0.6)] [transform-style:preserve-3d] select-none"
        style={{
          transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg) rotateZ(${t.active ? 0 : 1.5}deg)`,
          transition: t.active ? "transform 60ms linear" : "transform 600ms cubic-bezier(.2,.8,.2,1)",
        }}
        aria-label="Example GroveProof credit"
      >
        {/* moving light, like a reflection on a printed card */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[28px]"
          style={{ background: `radial-gradient(420px circle at ${t.gx}% ${t.gy}%, rgba(255,255,255,${t.active ? 0.16 : 0.07}), transparent 45%)` }}
        />
        <div className="flex items-start justify-between gap-4 [transform:translateZ(30px)]">
          <div>
            <div className="text-sm text-[#A9D5B9]">Example credit</div>
            <div className="font-display text-3xl font-extrabold leading-none mt-1">GP-1</div>
            <div className="text-[#CFE6D7] mt-1">Nallamala hills forest, Andhra Pradesh</div>
          </div>
          <div className="stamp-in-late [transform:translateZ(60px)]">
            <Hex className="w-16 h-16 bg-[#7FC29B] text-canopy text-2xl font-bold">✓</Hex>
          </div>
        </div>

        <svg viewBox="0 0 230 150" className="w-full mt-5 [transform:translateZ(20px)]" aria-hidden="true">
          {CELLS.map((c, i) => (
            <polygon
              key={c.k}
              points={hexPoints(c.x, c.y)}
              className="cell-in"
              style={{ animationDelay: reduced ? "0ms" : `${300 + i * 28}ms` }}
              fill={i % 7 === 3 ? "#3E8E5E" : "#2F7D4F"}
              stroke="#7FC29B"
              strokeWidth="1"
            />
          ))}
        </svg>

        <div className="grid grid-cols-3 gap-3 mt-4 [transform:translateZ(40px)]">
          <div><div className="text-xs text-[#A9D5B9]">Forest now</div><div className="font-display font-bold text-xl">91.9 ha</div></div>
          <div><div className="text-xs text-[#A9D5B9]">Tree loss</div><div className="font-display font-bold text-xl">0.0%</div></div>
          <div><div className="text-xs text-[#A9D5B9]">Map cells</div><div className="font-display font-bold text-xl">{CELLS.length}</div></div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/15 text-xs text-[#A9D5B9] break-all [transform:translateZ(20px)]">
          Recipe fingerprint on-chain: 0x205b6334…4783a971
        </div>
      </div>
      <p className="text-sm muted mt-3 text-center">Illustration. Real credits come from live satellite checks.</p>
    </div>
  );
}

// ------------------------------------------------------------------ four questions

const QUESTIONS = [
  {
    q: "Is the forest really there?",
    a: "We use free Sentinel-2 satellite pictures, remove the clouds and compare a before and an after picture. A trained model marks every 10 m square as forest or not forest.",
    proof: `${MODEL_ACCURACY} accuracy on areas the model never saw`,
  },
  {
    q: "Is this land counted only once?",
    a: "The outline of the forest is turned into small hexagon map cells and saved in the smart contract. If anyone tries to register one of those cells again, the contract says no.",
    proof: "Verdict: Already claimed",
  },
  {
    q: "Is the forest still standing?",
    a: "The same forest can be checked again later with newer pictures. If 5% or more of it has gone, the contract freezes the credits that have not been used yet.",
    proof: "Badge: Frozen, forest loss detected",
  },
  {
    q: "Can I check it myself?",
    a: "Each check saves exactly what it used (satellite scenes, dates, rules and model) and stores a fingerprint of it on the blockchain, so you can run it again and compare.",
    proof: "One click to run the check again",
  },
];

function Questions() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section ref={ref} id="questions" data-section className="space-y-6">
      <h2 className="text-3xl sm:text-4xl font-extrabold max-w-2xl">Four questions every carbon credit must answer</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {QUESTIONS.map((x) => (
          <article key={x.q} data-reveal className="theme-box p-6">
            <h3 className="text-xl font-bold">{x.q}</h3>
            <p className="mt-2 leading-relaxed theme-soft">{x.a}</p>
            <p className="mt-4 inline-flex items-center gap-2 font-bold theme-accent">
              <span className="glow"><Hex className="w-5 h-5 bg-[#7FC29B] text-canopy text-[10px]">✓</Hex></span>{x.proof}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ animated audit trail

// Each step has its own colour; the box and the number circle glow in it.
// One theme colour for every step (same as the rest of the site).
const THEME = "#1F6B47";

const TRAIL = [
  { title: "Forest registered", text: "23 map cells claimed by the owner's wallet", color: THEME },
  { title: "Checked by satellites", text: "Result: Verified, with the check details saved on-chain", color: THEME },
  { title: "Credits created", text: "291 credits, never more than the satellites allow", color: THEME },
  { title: "Credits sold", text: "40 credits to a buyer, paid on-chain", color: THEME },
  { title: "Credits retired", text: "25 credits used for a company's climate claim and removed for good", color: THEME },
  { title: "Checked again", text: "If the forest has been cut, the unused credits are frozen", color: THEME },
];

// Audit trail: each step is a box that drops in when it scrolls into view.
// One shared observer sorts steps top-to-bottom, so boxes that appear together
// still drop in one after another, downwards.
function AuditTrail() {
  const reduced = useReducedMotion();
  const items = useRef([]);
  const [delays, setDelays] = useState(() => TRAIL.map(() => null)); // null = not shown yet
  const [shown, setShown] = useState(0);
  const listRef = useRef(null);
  const [prog, setProg] = useState(0); // 0..1, how far the line has drawn

  // The green line grows from the first step to the last as you scroll down.
  useEffect(() => {
    if (reduced) { setProg(1); return; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = listRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = (window.innerHeight * 0.7 - (r.top + 24)) / Math.max(r.height - 48, 1);
      setProg(Math.min(1, Math.max(0, p)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [reduced]);

  useEffect(() => {
    if (reduced) { setDelays(TRAIL.map(() => 0)); setShown(TRAIL.length); return; }
    const io = new IntersectionObserver((entries) => {
      const fresh = entries
        .filter((e) => e.isIntersecting)
        .map((e) => Number(e.target.dataset.i))
        .sort((a, b) => a - b);
      if (!fresh.length) return;
      fresh.forEach((i, k) => {
        io.unobserve(items.current[i]);
        const d = k * 170;
        setDelays((arr) => arr.map((v, j) => (j === i ? d : v)));
        setTimeout(() => setShown((n) => Math.max(n, i + 1)), d + 200);
      });
    }, { threshold: 0.6, rootMargin: "0px 0px -8% 0px" });
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section id="story" data-section className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
      <div className="lg:sticky lg:top-36">
        <h2 className="text-3xl sm:text-4xl font-extrabold">Follow a credit from the forest to the buyer</h2>
        <p className="mt-3 text-lg muted">Example story. Each step is a transaction on the Polygon test network. Type a credit number on the Look up page and you get this timeline, with a link to every transaction.</p>
        <Link to="/lookup?q=GP-1" className="btn-quiet mt-5">See a credit's story</Link>
      </div>
      <ol ref={listRef} className={`relative ml-3 ${shown === TRAIL.length && prog >= 1 && !reduced ? "trail-live" : ""}`}>
        <span className="absolute left-0 top-6 w-0.5 bg-line" style={{ height: "calc(100% - 3rem)" }} aria-hidden />
        <span
          className="absolute -left-px top-6 w-1 rounded-full bg-[#1F6B47] shadow-[0_0_10px_rgba(127,194,155,.9)]"
          style={{ height: `calc((100% - 3rem) * ${prog})` }}
          aria-hidden
        />
        {prog > 0 && prog < 1 && <span className="trail-head" style={{ top: `calc(1.5rem + (100% - 3rem) * ${prog})` }} aria-hidden />}
        {/* a light that keeps travelling down the line once every step is shown */}
        <span className="trail-light" aria-hidden />
        {TRAIL.map((step, i) => (
          <li
            key={step.title}
            ref={(el) => (items.current[i] = el)}
            data-i={i}
            className={`trail-step relative pl-12 pb-4 ${delays[i] === null ? "opacity-0" : "trail-pop"}`}
            style={{ "--c": step.color, "--d": `${i * 0.45}s`, ...(delays[i] ? { animationDelay: `${delays[i]}ms` } : {}) }}
          >
            <span className="trail-num absolute -left-[17px] top-4 w-9 h-9 rounded-full flex items-center justify-center text-white font-display font-bold">
              {i + 1}
            </span>
            <div className="trail-box lift rounded-2xl p-4">
              <div className="font-display font-bold text-lg text-white">{step.title}</div>
              <div className="text-white/80">{step.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}


// ------------------------------------------------------------------ the problem, measured by others

const EVIDENCE = [
  {
    stat: "90%+",
    finding: "of credits from 26 forest-protection projects in 6 countries did not really offset emissions, by the researchers' estimate.",
    cite: "West et al., Science, 2023",
    url: "https://nachrichten.idw-online.de/2023/08/25/carbon-credits-from-avoided-deforestation-often-fail-to-deliver-what-they-promise",
    answer: "GroveProof checks the forest itself from space before any credit exists.",
  },
  {
    stat: "<16%",
    finding: "of credits from over 2,300 projects matched real emission reductions. Avoided-deforestation projects reached 25% of what they claimed.",
    cite: "Probst et al., Nature Communications, 2024",
    url: "https://tum.de/en/news-and-events/all-news/press-releases/details/carbon-crediting-is-substantially-overestimated",
    answer: "Credits are calculated by code from what satellites clearly see, with at least 28% held back for uncertainty and a safety buffer.",
  },
  {
    stat: "29%",
    finding: "of credits analysed in California's forest offset program were over-credited, about 30 million tonnes of CO₂.",
    cite: "Badgley et al., Global Change Biology, 2022",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9299598",
    answer: "The contract will not create more credits than the satellite check allows, and the rules are public.",
  },
  {
    stat: "80%+",
    finding: "of a 100-year wildfire safety reserve for California forest credits was used up by fires in just two seasons, in verified losses alone.",
    cite: "Badgley & Cullenward, CarbonPlan, 2022",
    url: "https://carbonplan.org/blog/buffer-analysis-update",
    answer: "If a later check finds the forest has gone, the credits that are left get frozen.",
  },
];

function Evidence() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section ref={ref} id="why" data-section className="space-y-6">
      <div className="max-w-3xl">
        <h2 className="text-3xl sm:text-4xl font-extrabold">Why forest credits need proof</h2>
        <p className="mt-3 text-lg muted">Researchers have looked closely at forest credits, and the results are worrying. Here is what they found, and what GroveProof does about each one.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {EVIDENCE.map((e) => (
          <article key={e.cite} data-reveal className="theme-box p-6 flex flex-col">
            <div className="font-display text-5xl font-extrabold theme-stat leading-none">{e.stat}</div>
            <p className="mt-3 leading-relaxed">{e.finding}</p>
            <a href={e.url} target="_blank" rel="noreferrer" className="mt-2 text-sm theme-soft underline">{e.cite}</a>
            <p className="mt-auto pt-4 border-t border-white/15 flex gap-2 font-bold theme-accent">
              <span className="glow shrink-0 mt-0.5"><Hex className="w-5 h-5 bg-[#7FC29B] text-canopy text-[10px]">✓</Hex></span>{e.answer}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ measured, not promised

const MS_ICONS = {
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  shield: <><path d="M12 2.8l7.2 3v6c0 4.6-3 7.8-7.2 9.4-4.2-1.6-7.2-4.8-7.2-9.4v-6z" /><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></>,
  ai: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5M3 13h2M19 13h2" /><path d="M4 4l16 16" /></>,
  buffer: <><path d="M4 20h16M6 20V10M10 20V6M14 20V9M18 20v-4" /><path d="M3 4h18" strokeDasharray="2 2" /></>,
};

const MEASURED = [
  { icon: "target", value: 93.1, suffix: "%", decimals: 1, title: "Forest map accuracy", text: "tested on areas the model never saw while training" },
  { icon: "shield", value: 5, suffix: " of 5", title: "Cheating attempts refused", text: "by the smart contract in our tests, like selling the same land twice" },
  { icon: "flask", value: 51, suffix: "", title: "Automatic tests passing", text: "22 for the smart contract and 29 for the satellite checker" },
  { icon: "ai", value: 0, suffix: "", title: "Numbers written by AI", text: "a guard throws away any AI text with a number that is not in the result" },
  { icon: "buffer", value: 28, suffix: "%+", title: "Held back for safety", text: "at least 20% for uncertainty, then 10% of the rest as a safety buffer" },
];

function CountUp({ to, decimals = 0, on, delay }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0, start = 0;
    const t0 = setTimeout(() => {
      const step = (t) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / 1100);
        setV(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(t0); cancelAnimationFrame(raf); };
  }, [on, to, delay]);
  return <>{v.toFixed(decimals)}</>;
}

function Measured() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const step = 450; // ms between milestones, left to right

  return (
    <section ref={ref} id="results" data-section className={`relative overflow-hidden rounded-[32px] text-white p-8 sm:p-12 ms-section ${on ? "ms-on" : ""}`}>
      <div className="max-w-2xl">
        <div className="text-sm font-bold tracking-[0.18em] uppercase text-[#9FD8B4]">Test results</div>
        <h2 className="text-3xl sm:text-4xl font-extrabold mt-2">What our tests show so far</h2>
        <p className="mt-3 text-[#CFE6D7]">These come from small tests we ran ourselves. The README has the full results and what they do not cover.</p>
      </div>

      <div className="relative mt-12">
        {/* the line that draws itself from left to right (top to bottom on phones) */}
        <div className="hidden lg:block absolute left-[10%] right-[10%] top-[52px] h-[3px] rounded-full bg-white/10" aria-hidden />
        <div className="hidden lg:block absolute left-[10%] right-[10%] top-[52px] h-[3px] rounded-full ms-line bg-gradient-to-r from-[#7FC29B] via-[#BDEBCD] to-[#7FC29B] shadow-[0_0_14px_rgba(127,194,155,.9)]" aria-hidden />
        <div className="lg:hidden absolute left-[51px] top-4 bottom-4 w-[3px] rounded-full bg-white/10" aria-hidden />

        <ol className="relative grid lg:grid-cols-5 gap-8 lg:gap-4">
          {MEASURED.map((m, i) => (
            <li key={m.title} className="ms-node flex lg:flex-col items-start lg:items-center gap-5 lg:gap-0 lg:text-center" style={{ "--d": `${300 + i * step}ms` }}>
              <div className="ms-orb shrink-0">
                <svg viewBox="0 0 24 24" className="w-11 h-11 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {MS_ICONS[m.icon]}
                </svg>
                <span className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-white text-canopy text-xs font-extrabold flex items-center justify-center shadow">{i + 1}</span>
              </div>
              <div className="lg:mt-6">
                <div className="font-display text-4xl font-extrabold text-[#BDEBCD] mono">
                  <CountUp to={m.value} decimals={m.decimals || 0} on={on} delay={300 + i * step} />{m.suffix}
                </div>
                <div className="font-bold text-lg mt-1">{m.title}</div>
                <p className="text-sm text-[#CFE6D7] mt-1 lg:max-w-[200px] lg:mx-auto">{m.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ honest limits

const NOT = [
  "It is not an official registry or a certified standard. The carbon numbers use a simple demo method based on IPCC default values.",
  "It does not replace people visiting the forest. Satellites see the tops of the trees and can miss damage underneath.",
  "No real money is involved. Everything runs on the Polygon Amoy test network.",
  "It cannot tell who owns the land. That needs land records, not satellite pictures.",
];

function WhatItIsNot() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section ref={ref} id="limits" data-section className="grid lg:grid-cols-[1fr_1.4fr] gap-8 items-start">
      <div>
        <h2 className="text-3xl sm:text-4xl font-extrabold">What GroveProof is not</h2>
        <p className="mt-3 text-lg muted">It does not replace registries or the people who visit forests. It gives them a record they can check.</p>
      </div>
      <ul className="space-y-3">
        {NOT.map((t) => (
          <li key={t} data-reveal className="theme-box p-4 flex gap-3">
            <span className="glow shrink-0"><Hex className="w-6 h-6 bg-[#7FC29B] text-canopy text-xs font-bold">!</Hex></span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}


// ------------------------------------------------------------------ 3D forest cut-out
// A slice of forest land cut out of the ground, with soil layers on its sides, a map-cell grid
// on top, and a satellite scanning it. Drawn in SVG (no image files), gently floating.

const T = [150, 150], R = [270, 210], B = [150, 270], L = [30, 210];
const at = (u, v) => [T[0] + u * (R[0] - T[0]) + v * (L[0] - T[0]), T[1] + u * (R[1] - T[1]) + v * (L[1] - T[1])];
const pts = (a) => a.map((q) => q.join(",")).join(" ");
const down = (q, d) => [q[0], q[1] + d];
const LAYERS = [
  [0, 7, "#2A6E45", "#348553"],
  [7, 21, "#4E3220", "#65432B"],
  [21, 35, "#6B4A2F", "#86603F"],
  [35, 48, "#7C7366", "#988E80"],
];
const TREES = [
  [0.1, 0.16, "p", 1.0], [0.3, 0.08, "r", 1.05], [0.52, 0.1, "p", 1.15], [0.74, 0.12, "r", 0.95], [0.92, 0.18, "p", 0.85],
  [0.16, 0.38, "r", 1.1], [0.38, 0.32, "p", 1.0], [0.6, 0.36, "r", 1.2], [0.84, 0.4, "p", 1.0],
  [0.08, 0.62, "p", 0.9], [0.3, 0.58, "r", 1.0], [0.52, 0.6, "p", 1.1], [0.76, 0.64, "r", 0.95],
  [0.2, 0.84, "r", 0.9], [0.44, 0.84, "p", 0.95], [0.66, 0.86, "r", 0.85], [0.9, 0.82, "p", 0.8],
].map(([u, v, k, s], i) => { const [x, y] = at(u, v); return { x, y, k, s, i }; }).sort((a, b) => a.y - b.y);

// Broadleaf canopy: several overlapping leaf clumps, dark underneath and lit from the top left.
const CLUMPS = [
  [0, -22, 13, "#1B4F2E"], [-8, -27, 9, "#24623A"], [8, -26, 10, "#215B36"], [0, -33, 9, "#2E7444"],
  [-6, -33, 6.5, "#3F8C55"], [5, -35, 6, "#4E9E62"], [-3, -38, 4.5, "#73BD7E"], [-9, -25, 4, "#5BA86A"],
];
// Pine: four tiers, each a little lighter towards the top.
const TIERS = [[-12, 13, "#163F27"], [-21, 11, "#1D4E31"], [-29, 8.5, "#25603C"], [-36, 6, "#2F7247"]];

function Tree({ x, y, k, s, i }) {
  const flip = i % 2 ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${s * flip} ${s})`}>
      <ellipse cx={5 * flip} cy="1.5" rx="13" ry="4.5" fill="rgba(10,30,15,.35)" filter="url(#treeShadow)" />
      <path d="M-2.6 0 L-1.4 -18 L1.4 -18 L2.6 0 Z" fill="#4A2F1D" />
      <path d="M0.2 0 L0.6 -18 L1.4 -18 L2.6 0 Z" fill="#2E1C10" />
      {k === "r" ? (
        <g filter="url(#leafy)">
          {CLUMPS.map(([cx, cy, r, c], j) => <circle key={j} cx={cx} cy={cy} r={r} fill={c} />)}
          <circle cx="4" cy="-20" r="9" fill="rgba(5,25,12,.28)" />
        </g>
      ) : (
        <g filter="url(#leafy)">
          {TIERS.map(([ty, w, c], j) => (
            <g key={j}>
              <path d={`M0 ${ty - 14} L${-w} ${ty} Q0 ${ty + 3} ${w} ${ty} Z`} fill={c} />
              <path d={`M0 ${ty - 14} L${-w} ${ty} Q${-w / 2} ${ty + 1.5} 0 ${ty + 1} Z`} fill="rgba(160,220,170,.16)" />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

function ForestCutout() {
  const leftFace = (d1, d2) => pts([down(L, d1), down(B, d1), down(B, d2), down(L, d2)]);
  const rightFace = (d1, d2) => pts([down(B, d1), down(R, d1), down(R, d2), down(B, d2)]);
  const grid = [0.2, 0.4, 0.6, 0.8];
  return (
    <figure className="relative select-none" aria-label="Illustration: a piece of forest land cut out of the ground, scanned by a satellite">
      <svg viewBox="0 0 300 340" className="w-full h-auto overflow-visible" role="img" aria-hidden="true">
        <defs>
          <radialGradient id="leafA" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#7FC29B" /><stop offset=".55" stopColor="#2F7D4F" /><stop offset="1" stopColor="#1F5A3A" /></radialGradient>
          <linearGradient id="pine" x1="0" x2="1"><stop offset="0" stopColor="#2F7D4F" /><stop offset="1" stopColor="#174A30" /></linearGradient>
          <linearGradient id="cutTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5E9B4C" /><stop offset="1" stopColor="#2E6A33" /></linearGradient>
          <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#BDEBCD" stopOpacity=".9" /><stop offset="1" stopColor="#BDEBCD" stopOpacity="0" /></linearGradient>
          <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#E9FFF1" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <radialGradient id="orbG" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#B9EBCB" /><stop offset=".5" stopColor="#3C9A68" /><stop offset="1" stopColor="#1F6B47" /></radialGradient>
          <clipPath id="topClip"><polygon points={pts([T, R, B, L])} /></clipPath>
          <clipPath id="sideClip"><polygon points={pts([L, B, R, down(R, 48), down(B, 48), down(L, 48)])} /></clipPath>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
          <filter id="treeShadow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="1.8" /></filter>
          {/* ragged, leafy edges for the tree crowns */}
          <filter id="leafy" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="2" seed="5" result="t" />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="4.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* grass texture for the top of the block */}
          <filter colorInterpolationFilters="sRGB" id="grass" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" />
            <feColorMatrix values="0 0 0 0 0.42  0 0 0 0 0.62  0 0 0 0 0.25  0 0 0 1.4 -0.5" />
          </filter>
          <filter colorInterpolationFilters="sRGB" id="soil" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="8" />
            <feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.06  0 0 0 0 0.03  0 0 0 1.5 -0.5" />
          </filter>
        </defs>

        <ellipse cx="150" cy="330" rx="118" ry="14" fill="rgba(23,58,43,.35)" filter="url(#soft)" />

        <g className="dio-float">
          {/* soil layers on the two cut sides */}
          {LAYERS.map(([d1, d2, cl, cr]) => (
            <g key={d1}>
              <polygon points={leftFace(d1, d2)} fill={cl} />
              <polygon points={rightFace(d1, d2)} fill={cr} />
            </g>
          ))}
          {/* roots and pebbles */}
          <path d="M70 238 q6 10 2 18 M100 254 q-4 8 3 15 M196 255 q5 9 0 17 M232 238 q-5 8 2 16" stroke="#3B2416" strokeWidth="1.4" fill="none" opacity=".7" />
          {[[60, 265], [90, 282], [128, 296], [180, 296], [214, 280], [246, 263]].map(([x, y]) => (
            <ellipse key={x} cx={x} cy={y} rx="3.4" ry="2.2" fill="#B5AC9E" opacity=".8" />
          ))}
          <g clipPath="url(#sideClip)"><rect x="0" y="200" width="300" height="140" filter="url(#soil)" /></g>
          <polyline points={pts([L, B, R])} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />

          {/* top: grass with the map-cell grid */}
          <polygon points={pts([T, R, B, L])} fill="url(#cutTop)" />
          <g clipPath="url(#topClip)"><rect x="20" y="140" width="260" height="140" filter="url(#grass)" opacity=".55" /></g>
          <g stroke="rgba(255,255,255,.22)" strokeWidth="0.7">
            {grid.map((s) => (
              <g key={s}>
                <line x1={T[0] + s * (L[0] - T[0])} y1={T[1] + s * (L[1] - T[1])} x2={R[0] + s * (B[0] - R[0])} y2={R[1] + s * (B[1] - R[1])} />
                <line x1={T[0] + s * (R[0] - T[0])} y1={T[1] + s * (R[1] - T[1])} x2={L[0] + s * (B[0] - L[0])} y2={L[1] + s * (B[1] - L[1])} />
              </g>
            ))}
          </g>
          {/* the satellite's scan line sweeping across the land */}
          <g clipPath="url(#topClip)">
            <polygon className="dio-scan" points={pts([T, L, [L[0] + 14, L[1] + 7], [T[0] + 14, T[1] + 7]])} fill="url(#scan)" />
          </g>
          {TREES.map((tr) => <Tree key={`${tr.x}-${tr.y}`} {...tr} />)}

          {/* verified badge */}
          <g className="dio-badge">
            <circle cx="262" cy="132" r="19" fill="url(#orbG)" stroke="#fff" strokeWidth="3" />
            <text x="262" y="139" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff">✓</text>
          </g>
        </g>

        {/* satellite with a beam down to the land */}
        <polygon className="dio-beam" points="196,64 118,206 214,236" fill="url(#beam)" />
        <g className="dio-sat">
          <g transform="translate(196 52) rotate(-22)">
            <rect x="-46" y="-7" width="32" height="14" rx="2" fill="#1F4D6B" stroke="#E8EEE9" strokeWidth="1.2" />
            <rect x="14" y="-7" width="32" height="14" rx="2" fill="#1F4D6B" stroke="#E8EEE9" strokeWidth="1.2" />
            <path d="M-38 -7v14M-30 -7v14M-22 -7v14M22 -7v14M30 -7v14M38 -7v14" stroke="rgba(255,255,255,.45)" strokeWidth=".8" />
            <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#F4F7F5" stroke="#9FB3A7" />
            <rect x="-14" y="-1" width="4" height="2" fill="#9FB3A7" /><rect x="10" y="-1" width="4" height="2" fill="#9FB3A7" />
            <circle cx="0" cy="12" r="4" fill="#C9D6CE" stroke="#9FB3A7" />
          </g>
        </g>
      </svg>
      <figcaption className="text-sm muted text-center -mt-1">Every 10 m square of land, checked from space</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ FAQ

const FAQ = [
  ["What is a carbon credit?", "One credit stands for one tonne of CO₂ kept out of the air, here by a forest that keeps growing. Companies buy and retire credits to balance some of their own emissions."],
  ["Do I need a crypto wallet to check a forest?", "No. Anyone can check a forest for free without a wallet. A wallet (like MetaMask) is only needed to register a forest, create credits, buy or retire them."],
  ["Is this real money?", "No. Everything runs on the Polygon Amoy test network, where coins are free test coins with no value."],
  ["Where do the satellite pictures come from?", "From Sentinel-2, free satellites of the European Copernicus program. They photograph every place on Earth about every 5 days at 10 m detail. We read them through Microsoft Planetary Computer."],
  ["What if it is cloudy?", "Clouds are removed pixel by pixel and never counted as tree loss. If too much of the land is hidden, the answer is “Can’t check yet” and no credits are created."],
  ["Why are there fewer credits than the forest stores?", "We would rather count too little than too much. GroveProof sets aside 20 to 35% for uncertainty and 10% as a safety buffer, and only counts forest the satellites saw clearly."],
  ["What stops someone selling the same forest twice?", "Every forest is turned into hexagon map cells stored in the smart contract. If any cell is already claimed, the contract refuses the new project."],
  ["What if the forest is cut down after credits are sold?", "Anyone can run a new check. If 5% or more of the forest is gone, the contract freezes the remaining credits so they cannot be sold or moved."],
  ["Does AI decide anything?", "No. All the numbers come from code, and the smart contract decides what happens to credits. AI only writes the short explanation, and if that text contains a number that is not in the result, we throw it away."],
  ["How long does a check take?", "A saved sample opens in about a second. A live check downloads real satellite pictures and takes about 1 to 2 minutes."],
];

function Faq() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section ref={ref} id="faq" data-section className="grid lg:grid-cols-[1fr_1.6fr] gap-8 items-start">
      <div className="lg:sticky lg:top-36">
        <h2 className="text-3xl sm:text-4xl font-extrabold">Questions people ask</h2>
        <p className="mt-3 text-lg muted">Tap a question to see the answer.</p>
      </div>
      <div className="space-y-3">
        {FAQ.map(([q, a]) => (
          <details key={q} data-reveal className="faq-item panel p-0 overflow-hidden">
            <summary className="flex items-center justify-between gap-4 p-5 font-bold text-lg">
              {q}
              <span className="faq-plus orb inline-flex items-center justify-center w-8 h-8 shrink-0 bg-[#1F6B47] text-white text-xl font-bold leading-none">+</span>
            </summary>
            <p className="faq-body px-5 pb-5 -mt-1 leading-relaxed muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ "On this page" bar

const SECTIONS = [
  ["top", "Overview"], ["how", "How it works"], ["why", "Why proof"], ["questions", "4 questions"], ["story", "Credit story"],
  ["results", "Results"], ["limits", "Limits"], ["faq", "FAQ"],
];

function PageNav() {
  const [on, setOn] = useState("top");
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setOn(e.target.id); });
    }, { rootMargin: "-40% 0px -55% 0px" });
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  useEffect(() => {  // keep the highlighted chip visible on narrow screens
    document.querySelector(`.page-nav a[href="#${on}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [on]);
  return (
    <nav aria-label="On this page" className="sticky top-16 z-[900] -mx-4 px-4 py-2 bg-lichen/90 backdrop-blur border-b border-line">
      <div className="page-nav flex gap-1 overflow-x-auto">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={on === id ? "on" : ""}
             onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: "start" }); history.replaceState(null, "", `#${id}`); }}>
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------ page

function WelcomeBack() {
  const [last, setLast] = useState(null);
  useEffect(() => { setLast(recentChecks()[0] || null); }, []);
  if (!last) return null;
  const v = VERDICTS[last.verdict] || VERDICTS.None;
  return (
    <Link to={`/check?open=${last.check_id}`} className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white/10 border border-white/25 backdrop-blur px-4 py-3 hover:bg-white/15 transition-colors">
      <span className={`orb w-9 h-9 inline-flex items-center justify-center ${v.bg} text-white font-bold`}>{v.icon}</span>
      <span className="text-left">
        <span className="block text-xs text-white/70">Welcome back. Your last check, {timeAgo(last.at)}</span>
        <span className="block font-bold">{last.name}: {v.label}{last.verdict === "Verified" ? `, ${last.credits} credits` : ""} →</span>
      </span>
    </Link>
  );
}

function ForestToCredit() {
  return (
    <section id="how" data-section className="space-y-6">
      <div className="max-w-3xl">
        <h2 className="text-3xl sm:text-4xl font-extrabold">How a forest becomes a credit</h2>
        <p className="mt-3 text-lg muted">Satellites look at the forest in 10 m squares. Only the forest they can see clearly is turned into credits, and the smart contract keeps the record.</p>
      </div>
      <div className="grid md:grid-cols-[1fr_auto_1.1fr] gap-6 items-center">
        <div className="max-w-[360px] mx-auto w-full"><ForestCutout /></div>
        <div className="flex md:flex-col items-center justify-center gap-2 text-center text-sm font-bold text-[#1F6B47]">
          <IconTile name="arrow" size="lg" tone="solid" className="rotate-90 md:rotate-0" />
          <span>Satellite check<br />+ smart contract</span>
        </div>
        <div className="max-w-[460px] mx-auto w-full"><CreditCard /></div>
      </div>
    </section>
  );
}

// Every section after the hero rises gently from below the first time it scrolls into view.
function useRiseOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const els = [...document.querySelectorAll("[data-rise]")];
    els.forEach((el) => el.classList.add("rise"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("rise-in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const FEATURES = [
  { icon: "verifier", title: "Verified credits", text: "A satellite check first, then photos and reports, then a person reviews them.", to: "/check" },
  { icon: "qr", title: "Credit passport + QR", text: "Scan a QR code to see where a credit came from and who holds it now.", to: "/lookup" },
  { icon: "dashboard", title: "Live dashboard", text: "Different views for companies, forest owners, reviewers and visitors.", to: "/dashboard" },
  { icon: "chain", title: "Audit trail", text: "Every sale and retirement is a blockchain transaction you can open.", to: "/lookup?q=GP-1" },
  { icon: "shield", title: "No double counting", text: "The same land cannot be registered twice, and a used credit is destroyed.", to: "/lookup?q=GP-1#trust" },
  { icon: "sparkle", title: "Ask GroveProof", text: "Ask things like “why is this project still pending?” and get an answer from the records.", to: "/lookup?q=GP-1" },
];

function Features() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {FEATURES.map((f) => (
        <Link key={f.title} to={f.to} data-reveal className="feature-card choice panel p-5 flex gap-4 items-start">
          <IconTile name={f.icon} size="lg" />
          <span><span className="block font-bold text-lg">{f.title}</span><span className="block text-sm muted mt-0.5">{f.text}</span></span>
        </Link>
      ))}
    </section>
  );
}

export default function Landing() {
  const { t, prefs } = usePrefs();
  useRiseOnScroll();
  return (
    <div className="-mt-6 sm:-mt-10">
    <PageNav />
    <div className="space-y-20 sm:space-y-28 pt-6 sm:pt-8">
      <HeroScene>
        <h1 className="text-4xl sm:text-6xl lg:text-5xl xl:text-[3.4rem] font-extrabold leading-[1.12] drop-shadow-[0_2px_18px_rgba(0,0,0,.35)]">
          {prefs.lang === "en" ? (
            <>Forest carbon credits, <span className="brush-wrap hero-word">checked from space<Brush thick={9} /></span> before they are sold.</>
          ) : t("hero.title")}
        </h1>
        <p className="mt-5 text-xl text-white/85 max-w-xl leading-relaxed">
          {t("hero.sub")}
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link to="/check" className="btn-main text-lg px-7">{t("nav.check")}</Link>
          <Link to="/dashboard" className="btn-quiet text-lg px-7">{t("nav.dashboard")}</Link>
        </div>
        <WelcomeBack />
        <ul className="mt-8 grid grid-cols-3 gap-4 text-sm max-w-xl">
          <li><span className="font-display font-bold text-2xl block">Free</span><span className="text-white/75">Sentinel-2 satellite data</span></li>
          <li><span className="font-display font-bold text-2xl block">5</span><span className="text-white/75">kinds of cheating refused</span></li>
          <li><span className="font-display font-bold text-2xl block">1 click</span><span className="text-white/75">to re-run any check</span></li>
        </ul>
      </HeroScene>

      <div data-rise><Features /></div>
      <div data-rise><ForestToCredit /></div>
      <div data-rise><Evidence /></div>
      <div data-rise><Questions /></div>
      <div data-rise><AuditTrail /></div>
      <div data-rise><Measured /></div>
      <div data-rise><WhatItIsNot /></div>
      <div data-rise><Faq /></div>

      <section data-rise className="panel p-8 sm:p-10 text-center">
        <h2 className="text-3xl font-extrabold">Try it with a <span className="brush-wrap">real forest<Brush /></span></h2>
        <p className="mt-2 muted text-lg">Pick a sample forest in Andhra Pradesh, or draw your own. Saved samples open in a second; a live check takes about a minute.</p>
        <Link to="/check" className="btn-main text-lg px-8 mt-6">Check a forest</Link>
      </section>
    </div>
    </div>
  );
}
