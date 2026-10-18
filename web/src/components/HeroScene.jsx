// Intro hero: a glass globe resting on moss in a misty forest, with floating hexagon icons.
// Everything is drawn in code (no stock photos): the moss and mist come from SVG noise filters,
// the globe's continents from the public-domain Natural Earth map (world-atlas package).
// The globe turns slowly with India in view and a pin on the sample forest in Andhra Pradesh.
// Moving the mouse shifts the icons at different depths (parallax). Reduced motion = still picture.
import { useEffect, useMemo, useRef, useState } from "react";
import { geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import { Icon } from "./Icon";

const LAND = feature(land110, land110.objects.land);
const GRATICULE = geoGraticule10();
const PIN = [78.8, 16.1]; // Nallamala hills, Andhra Pradesh (sample forest)
const R = 150; // globe radius in the SVG

// Small forests and factories on the globe: forests store carbon, factories emit it.
// Dense forest belts: [longitude, latitude, spread east-west, spread north-south, how many trees].
// Trees are scattered inside each belt (same pattern every time) and kept only where there is land.
const BELTS = [
  [-62, -5, 10, 6, 24], [-46, -20, 3, 4, 4], [-88, 15, 4, 3, 4], [21, -1, 7, 4, 15], [-6, 7, 5, 2, 5], [47.5, -18, 1.5, 4, 2],
  [108, 1, 9, 4, 12], [75.5, 12, 1.2, 3, 5], [79.5, 16.5, 2, 2.5, 6], [95, 23, 3, 4, 6], [110, 26, 5, 3, 4],
  [144, -6, 4, 2, 3], [150, -28, 2, 5, 3], [-100, 55, 22, 5, 16], [95, 60, 30, 5, 26], [45, 57, 10, 3, 7], [80.5, 21.5, 4, 3, 6], [35, -8, 4, 4, 4], [-60, 50, 6, 3, 4], [20, 63, 6, 3, 5],
  [-83, 38, 5, 4, 5], [15, 49, 8, 3, 5], [-123, 47, 3, 4, 3], [136, 46, 6, 4, 4],
];
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FORESTS = (() => {
  const rand = rng(42);
  const out = [];
  for (const [lon, lat, dx, dy, n] of BELTS) {
    let made = 0;
    for (let tries = 0; made < n && tries < n * 6; tries++) {
      const p = [lon + (rand() * 2 - 1) * dx, lat + (rand() * 2 - 1) * dy];
      if (geoContains(LAND, p)) { out.push(p); made++; }
    }
  }
  return out;
})();
// Famous rivers, including the Godavari and Krishna near the sample forest in Andhra Pradesh.
const RIVERS = {
  type: "MultiLineString",
  coordinates: [
    [[-50, -0.5], [-55, -2], [-60, -3.2], [-65, -3], [-70, -4], [-73.5, -4.5]],
    [[12.4, -6], [15.3, -4.3], [17, -1.5], [19, 1.5], [22, 2], [25, 0.5], [25.2, -2], [26, -5]],
    [[31, 30.5], [31.3, 27], [32.5, 24], [33, 21], [32.5, 18], [32.5, 15.6], [32.4, 12], [31.5, 9], [31.6, 4.8]],
    [[88.5, 22.2], [88, 24], [85.5, 25.5], [83, 25.3], [80.4, 25.9], [78.2, 27.5], [78.1, 29.9]],
    [[82.3, 16.6], [81.7, 17.3], [80.8, 18.6], [79.4, 18.8], [77.5, 19.2], [75.5, 19.8], [73.8, 20]],
    [[80.9, 15.8], [80.2, 16.5], [79.3, 16.5], [78, 16.2], [76.5, 16.3], [75, 16.8], [73.7, 17.9]],
    [[-89.3, 29.1], [-91, 31], [-90.5, 35], [-89.5, 37], [-90.2, 39], [-91.2, 43], [-93.5, 45.5]],
    [[121.5, 31.4], [117, 31], [114.3, 30.6], [111, 30.8], [106.5, 29.6], [104, 28.8], [100, 27], [98, 30]],
    [[106.5, 9.8], [105.8, 11.6], [105.8, 15.1], [104.5, 17.5], [102, 18], [100.1, 20.4], [99, 22], [98.5, 27]],
  ],
};
// A tiny touch of mountains: small snowy peaks on the Himalayas, Andes, Alps and Rockies.
const PEAKS = [
  [78, 32.5], [81, 30.3], [84, 28.6], [87, 28], [90, 28.2], [93, 28.6],
  [-70, -33], [-69, -25], [-70.5, -17], [-75.5, -10], [-77.5, -2], [-73.5, 5],
  [8, 46.3], [11, 46.8], [-110, 44], [-115, 50], [-106, 39],
];
const FACTORIES = [
  [116.4, 39.9], [121.5, 31.2], [113, 23], [72.8, 19], [77.2, 28.6], [88.3, 22.5], [8, 50.5], [2.3, 48.8], [-0.1, 51.5],
  [-87.6, 41.9], [-95.4, 29.8], [-74, 40.7], [139.7, 35.7], [37.6, 55.7], [-46.6, -23.5], [28, -26.2], [51.4, 35.7], [55.3, 25.2],
];

// ------------------------------------------------------------------ line icons (24 x 24)
const ICONS = {
  co2: (
    <>
      <path d="M7 18h10.2a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z" />
      <text x="12" y="15.6" textAnchor="middle" fontSize="5.4" fontWeight="700" fill="currentColor" stroke="none">CO₂</text>
      <path d="M9 21v1.5M12 21v2M15 21v1.5" />
    </>
  ),
  satellite: (
    <>
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" />
      <path d="M3.5 8.5l3-3 3 3-3 3zM14.5 18.5l3-3 3 3-3 3zM8 7l2 2M14 15l2 2" />
      <path d="M15.5 4.5a4 4 0 0 1 4 4M15.5 1.8a6.7 6.7 0 0 1 6.7 6.7" />
    </>
  ),
  tree: (<><path d="M12 2.8l5 6.4h-2.6l3.8 5.6H5.8l3.8-5.6H7z" /><path d="M12 14.8v6.4M8.5 21.2h7" /></>),
  leaf: (<><path d="M5 19C5 10.5 10.8 5 19 5c0 8.5-5.8 14-14 14z" /><path d="M5 19l8.5-8.5" /></>),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  shield: (<><path d="M12 2.8l7.2 3v6c0 4.6-3 7.8-7.2 9.4-4.2-1.6-7.2-4.8-7.2-9.4v-6z" /><path d="M8.7 12.2l2.3 2.3 4.4-4.6" /></>),
  search: (<><circle cx="10.5" cy="10.5" r="6.3" /><path d="M15.3 15.3L20.5 20.5M8 10.5h5M10.5 8v5" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3.2 3.4 3.2 14.6 0 18M12 3c-3.2 3.4-3.2 14.6 0 18" /></>),
  cells: (
    <>
      <path d="M7 3.5l3 1.7v3.5l-3 1.7-3-1.7V5.2zM14 3.5l3 1.7v3.5l-3 1.7-3-1.7V5.2zM10.5 9.8l3 1.7V15l-3 1.7-3-1.7v-3.5z" />
      <path d="M17.5 15.8l3 1.7V21" opacity=".6" />
    </>
  ),
  chart: (<><path d="M4 20V11M10 20V5M16 20v-6M3 20h18" /><path d="M4 8l6-4 6 6 5-4" opacity=".7" /></>),
  scale: (<><path d="M12 4v16M7 20h10M5 7.5h14" /><path d="M5 7.5l-2.6 5.5h5.2zM19 7.5l-2.6 5.5h5.2z" /></>),
};

const LABELS = {
  co2: "CO₂ stored, measured", satellite: "Free Sentinel-2 pictures", globe: "Works anywhere on Earth",
  link: "Each step saved on-chain", shield: "Blocks double counting", tree: "Living forest, re-checked",
  leaf: "Carbon kept in trees", search: "Run any check again", cells: "Land counts only once",
  chart: "Live dashboard", scale: "Fewer credits if data is unclear",
};

// [icon, left %, top %, size px, depth (parallax), float delay s]
const FLOATERS = [
  ["co2", 48, 9, 74, 0.9, 0],
  ["satellite", 65, 2, 58, 0.6, 1.2],
  ["globe", 85, 5, 64, 0.4, 0.6],
  ["link", 92, 29, 56, 1.0, 0.3],
  ["shield", 90, 55, 68, 0.8, 2.6],
  ["tree", 51, 80, 54, 1.1, 1.9],
  ["leaf", 49, 63, 50, 1.2, 1.6],
  ["search", 50, 52, 44, 0.5, 0.9],
  ["cells", 96, 44, 40, 0.7, 2.1],
  ["scale", 96, 82, 38, 0.55, 0.4],
];
const NUMBERS = [
  ["93.1%", 58, 21, 0.5],
  ["291 t CO₂", 83, 41, 0.8],
  ["0x205b…a971", 60, 93, 0.6],
];
const DOTS = [[60, 14], [77, 19], [93, 47], [53, 52], [69, 95], [98, 66], [47, 26]];

function hexPath(s) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(50 + s * Math.cos(a)).toFixed(1)},${(50 + s * Math.sin(a)).toFixed(1)}`;
  });
  return pts.join(" ");
}

function HexIcon({ name, size }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="block">
      <polygon points={hexPath(46)} fill="rgba(255,255,255,.07)" stroke="#fff" strokeWidth="3" />
      <g transform="translate(26 26) scale(2)" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" color="#fff">
        {ICONS[name]}
      </g>
    </svg>
  );
}

function useReduced() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
  }, []);
  return r;
}

// ------------------------------------------------------------------ the glass globe
function Globe({ reduced, hot }) {
  const speed = useRef({ now: 6, target: 6 });
  speed.current.target = hot ? 30 : 6; // spins faster while the pointer is on it
  const landRef = useRef(null);
  const gridRef = useRef(null);
  const riverRef = useRef(null);
  const pinRef = useRef(null);
  const markRefs = useRef([]);
  const marks = useMemo(() => [
    ...FORESTS.map((c, i) => ({ c, kind: Math.abs(c[1]) > 44 ? "pine" : "tree", s: 0.55 + ((i * 37) % 10) / 28 })),
    ...FACTORIES.map((c) => ({ c, kind: "factory", s: 1 })),
    ...PEAKS.map((c, i) => ({ c, kind: "peak", s: 0.8 + (i % 3) * 0.15 })),
  ], []);
  const projection = useMemo(() => geoOrthographic().scale(R).translate([200, 200]).clipAngle(90), []);
  const path = useMemo(() => geoPath(projection), [projection]);

  useEffect(() => {
    let raf = 0;
    let lon = -PIN[0] + 25; // start a little west so India turns into view
    const draw = () => {
      projection.rotate([lon, -14]);
      landRef.current?.setAttribute("d", path(LAND) || "");
      gridRef.current?.setAttribute("d", path(GRATICULE) || "");
      riverRef.current?.setAttribute("d", path(RIVERS) || "");
      const center = [-lon, 14];
      marks.forEach((m, i) => {
        const el = markRefs.current[i];
        if (!el) return;
        const d = geoDistance(m.c, center);            // 0 = facing us, PI/2 = edge
        if (d > 1.45) { el.style.display = "none"; return; }
        const q = projection(m.c);
        const k = Math.cos(d);                            // shrink towards the edge, like a real ball
        el.style.display = "";
        el.style.opacity = String(Math.min(1, k * 1.6));
        el.setAttribute("transform", `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)}) scale(${(m.s * (0.45 + 0.55 * k)).toFixed(3)})`);
      });
      const p = projection(PIN);
      const visible = Math.cos(((PIN[0] + lon) * Math.PI) / 180) > 0.15;
      if (pinRef.current) {
        pinRef.current.style.opacity = visible && p ? "1" : "0";
        if (p) pinRef.current.setAttribute("transform", `translate(${p[0]} ${p[1]})`);
      }
    };
    if (reduced) { lon = -PIN[0]; draw(); return; }
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    if (landRef.current) io.observe(landRef.current.ownerSVGElement);
    let lastDraw = 0;
    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) { last = t; return; }
      if (t - lastDraw < 24) return;          // about 40 frames a second
      lastDraw = t;
      const sp = speed.current;
      sp.now += (sp.target - sp.now) * 0.06;   // ease between slow and fast
      lon -= ((t - last) / 1000) * sp.now;      // degrees per second
      last = t;
      draw();
    };
    draw();
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [projection, path, reduced, marks]);

  // Orbit rings: back half drawn behind the globe, front half in front of it
  const rings = [
    { rx: 210, ry: 46, rot: -12, dur: 9 },
    { rx: 192, ry: 34, rot: 8, dur: 12 },
    { rx: 228, ry: 60, rot: -4, dur: 15 },
  ];
  const arc = (rx, ry, front) => `M ${200 - rx} 200 A ${rx} ${ry} 0 0 ${front ? 0 : 1} ${200 + rx} 200`;

  return (
    <svg viewBox="-40 -20 480 470" className={`globe-svg w-full h-auto overflow-visible ${hot ? "globe-hot" : ""}`} aria-hidden="true">
      <defs>
        <radialGradient id="g-ocean" cx="42%" cy="38%" r="70%">
          <stop offset="0" stopColor="#B6EEDC" stopOpacity=".75" />
          <stop offset=".5" stopColor="#3E8F78" stopOpacity=".7" />
          <stop offset="1" stopColor="#0C3328" stopOpacity=".92" />
        </radialGradient>
        <linearGradient id="g-land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DDF38A" />
          <stop offset=".45" stopColor="#9ACD45" />
          <stop offset="1" stopColor="#4F8A2A" />
        </linearGradient>
        <radialGradient id="g-rim" cx="50%" cy="50%" r="50%">
          <stop offset=".72" stopColor="#000" stopOpacity="0" />
          <stop offset=".93" stopColor="#0B2A1D" stopOpacity=".35" />
          <stop offset="1" stopColor="#E8FFF2" stopOpacity=".55" />
        </radialGradient>
        <radialGradient id="g-shine" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="g-moss-reflect" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#2F6B2A" stopOpacity="0" />
          <stop offset="1" stopColor="#2F6B2A" stopOpacity=".6" />
        </linearGradient>
        <radialGradient id="g-shade" cx="34%" cy="30%" r="80%">
          <stop offset=".35" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#03140C" stopOpacity=".62" />
        </radialGradient>
        <radialGradient id="g-halo" cx="50%" cy="50%" r="50%">
          <stop offset=".62" stopColor="#BDEBCD" stopOpacity="0" />
          <stop offset=".7" stopColor="#BDEBCD" stopOpacity=".55" />
          <stop offset="1" stopColor="#BDEBCD" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g-cloudfill"><stop offset="0" stopColor="#fff" stopOpacity=".7" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <clipPath id="g-clip"><circle cx="200" cy="200" r={R} /></clipPath>
        <filter id="g-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id="g-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>

      {/* contact shadow on the moss */}
      <ellipse cx="200" cy="356" rx="130" ry="20" fill="#06170E" opacity=".55" filter="url(#g-blur)" />

      {/* soft atmosphere around the globe */}
      <circle className="g-halo" cx="200" cy="200" r={R * 1.45} fill="url(#g-halo)" />
      {/* rings that ripple out while the pointer is on the globe */}
      <circle className="g-ping" cx="200" cy="200" r={R} fill="none" stroke="#D9F99D" strokeWidth="2" />
      <circle className="g-ping g-ping2" cx="200" cy="200" r={R} fill="none" stroke="#D9F99D" strokeWidth="2" />

      {/* orbit rings, back halves */}
      {rings.map((r, i) => (
        <g key={`b${i}`} transform={`rotate(${r.rot} 200 200)`}><g className={`g-ring g-ring${i}`}>
          <path d={arc(r.rx, r.ry, false)} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.3" />
        </g></g>
      ))}

      {/* the globe */}
      <g className="g-ball">
      <g clipPath="url(#g-clip)">
        <circle cx="200" cy="200" r={R} fill="url(#g-ocean)" />
        <path ref={gridRef} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".6" />
        <path ref={landRef} fill="url(#g-land)" stroke="rgba(255,255,255,.55)" strokeWidth=".6" opacity=".95" />
        <path ref={riverRef} fill="none" stroke="#4FC3E8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
        {marks.map((m, i) => (
          <g key={i} ref={(el) => (markRefs.current[i] = el)} style={{ display: "none" }}>
            {m.kind === "peak" ? (
              <>
                <path d="M-6 0L-1 -7.5 1.2 -4.4 2.6 -6 7 0z" fill="#7C8A6E" opacity=".85" />
                <path d="M-1 -7.5L-2.6 -5.1-1.6 -5.6-.6 -4.8.4 -5.8 1.2 -4.4z" fill="#F4F7F2" />
                <path d="M2.6 -6L1.8 -4.8 2.6 -5.1 3.4 -4.7z" fill="#F4F7F2" />
              </>
            ) : m.kind === "pine" ? (
              <>
                <ellipse cx="1.5" cy="0.6" rx="4" ry="1.3" fill="rgba(20,50,10,.35)" />
                <rect x="-0.6" y="-2.5" width="1.2" height="2.8" fill="#5A3B22" />
                <path d="M0 -11L-3.6 -5.5h2L-4.4 -1.8h8.8L1.6 -5.5h2z" fill="#1F5A30" />
                <path d="M0 -11L-3.6 -5.5h2L-4.4 -1.8H0z" fill="#2E7A3E" />
              </>
            ) : m.kind === "tree" ? (
              <>
                <ellipse cx="1.5" cy="0.6" rx="5" ry="1.6" fill="rgba(20,50,10,.35)" />
                <rect x="-0.7" y="-4" width="1.4" height="4.2" fill="#5A3B22" />
                <circle cx="0" cy="-7" r="4.2" fill="#2F7A33" />
                <circle cx="-2.2" cy="-5.2" r="2.8" fill="#28692C" />
                <circle cx="2.3" cy="-5.4" r="2.9" fill="#23602A" />
                <circle cx="-1.2" cy="-8.6" r="1.8" fill="#5FAE4C" />
              </>
            ) : (
              <>
                <ellipse cx="1" cy="0.6" rx="6" ry="1.6" fill="rgba(20,30,20,.35)" />
                <path d="M-5 0v-4.5l2.4-1.6v1.6l2.4-1.6v1.6l2.4-1.6V0z" fill="#6E7B76" stroke="#3C4744" strokeWidth=".4" />
                <rect x="3" y="-9" width="1.8" height="9" fill="#55605C" />
                <circle className="smoke s1" cx="3.9" cy="-11" r="1.6" fill="rgba(235,240,238,.75)" />
                <circle className="smoke s2" cx="4.6" cy="-13.5" r="2.1" fill="rgba(235,240,238,.55)" />
              </>
            )}
          </g>
        ))}
        {/* drifting clouds */}
        <g className="g-clouds" fill="url(#g-cloudfill)" opacity=".5">
          <ellipse cx="120" cy="120" rx="46" ry="9" /><ellipse cx="250" cy="150" rx="38" ry="7" /><ellipse cx="170" cy="250" rx="52" ry="8" />
          <ellipse cx="280" cy="270" rx="30" ry="6" /><ellipse cx="95" cy="210" rx="28" ry="6" /><ellipse cx="215" cy="92" rx="34" ry="6" />
        </g>
        <circle cx="200" cy="200" r={R} fill="url(#g-shade)" />
        <circle cx="200" cy="200" r={R} fill="url(#g-moss-reflect)" />
        <circle cx="200" cy="200" r={R} fill="url(#g-rim)" />
        {/* light coming through the glass */}
        <ellipse cx="148" cy="118" rx="62" ry="38" fill="url(#g-shine)" opacity=".75" transform="rotate(-32 148 118)" />
        <ellipse cx="270" cy="292" rx="34" ry="14" fill="url(#g-shine)" opacity=".35" transform="rotate(-32 270 292)" />
      </g>
      <circle cx="200" cy="200" r={R} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" />
      </g>

      {/* pin on the sample forest */}
      <g ref={pinRef} style={{ transition: "opacity 400ms" }}>
        <circle r="13" fill="#BDEBCD" opacity=".35" className="pin-pulse" />
        <circle r="5" fill="#fff" stroke="#1F6B47" strokeWidth="2.5" />
      </g>

      {/* orbit rings, front halves, with a satellite moving along one of them */}
      {rings.map((r, i) => (
        <g key={`f${i}`} transform={`rotate(${r.rot} 200 200)`}><g className={`g-ring g-ring${i}`}>
          <path d={arc(r.rx, r.ry, true)} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.4" />
          <path d={arc(r.rx, r.ry, true)} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"
                strokeDasharray="26 900" className={reduced ? "" : "ring-run"} style={{ animationDuration: `${hot ? r.dur / 3 : r.dur}s` }} filter="url(#g-glow)" />
        </g></g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ the whole scene
export default function HeroScene({ children }) {
  const reduced = useReduced();
  // Mouse position goes into CSS variables (--mx, --my), so moving the mouse never re-renders React.
  const [hot, setHot] = useState(false);
  const box = useRef(null);

  // Only the small icon layer and the globe box are touched, once per frame, so the big globe never restyles.
  const pos = useRef([0, 0]);
  const frame = useRef(0);
  const layer = useRef(null);
  const globeBox = useRef(null);
  function applyMove() {
    frame.current = 0;
    const [x, y] = pos.current;
    layer.current?.style.setProperty("--mx", x.toFixed(3));
    layer.current?.style.setProperty("--my", y.toFixed(3));
    if (globeBox.current) globeBox.current.style.transform = `translate(${(-x * 12).toFixed(1)}px, ${(-y * 9).toFixed(1)}px)`;
  }
  function move(e) {
    if (reduced || e.pointerType === "touch") return;
    const r = box.current.getBoundingClientRect();
    pos.current = [(e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5];
    if (!frame.current) frame.current = requestAnimationFrame(applyMove);
  }
  const shift = (d) => ({ "--d": d });

  return (
    <section
      id="top"
      data-section
      ref={box}
      onPointerMove={move}
      onPointerLeave={() => { pos.current = [0, 0]; if (!frame.current) frame.current = requestAnimationFrame(applyMove); }}
      className={`hero-scene relative overflow-hidden rounded-[32px] text-white ${hot ? "hero-hot" : ""}`}
    >
      {/* misty forest background */}
      <div className="absolute inset-0 hero-forest" aria-hidden />
      <svg className="absolute inset-0 w-full h-full hero-static" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter colorInterpolationFilters="sRGB" id="mist">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="2" seed="7" />
            <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.75  0 0 0 0 0.6  0 0 0 0.9 -0.25" />
          </filter>
          <filter colorInterpolationFilters="sRGB" id="moss" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="3" result="n" />
            <feColorMatrix in="n" values="0 0 0 0 0.12  0 0 0 0 0.3  0 0 0 0 0.08  0 0 0 1.6 -0.35" result="dark" />
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="9" result="big" />
            <feColorMatrix in="big" values="0 0 0 0 0.45  0 0 0 0 0.68  0 0 0 0 0.2  0 0 0 1.2 -0.3" result="light" />
            <feMerge result="m"><feMergeNode in="light" /><feMergeNode in="dark" /></feMerge>
            <feComposite in="m" in2="SourceGraphic" operator="in" />
          </filter>
          <linearGradient id="moss-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".25" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="moss-mask"><rect width="100%" height="100%" fill="url(#moss-fade)" /></mask>
        </defs>
        <rect width="100%" height="100%" filter="url(#mist)" opacity=".55" />
        <g mask="url(#moss-mask)">
          <ellipse cx="12%" cy="122%" rx="42%" ry="30%" fill="#24521D" />
          <ellipse cx="12%" cy="122%" rx="42%" ry="30%" filter="url(#moss)" opacity=".85" />
          <ellipse cx="73%" cy="116%" rx="46%" ry="40%" fill="#3B7726" />
          <ellipse cx="73%" cy="116%" rx="46%" ry="40%" filter="url(#moss)" opacity=".95" />
        </g>
      </svg>
      <div className="absolute inset-0 hero-vignette" aria-hidden />

      {/* floating icons, numbers and dots */}
      <div ref={layer} className="absolute inset-0 pointer-events-none hidden lg:block z-20" aria-hidden>
        {FLOATERS.map(([name, x, y, size, d, delay], i) => (
          <div key={name} className="absolute parallax" style={{ left: `${x}%`, top: `${y}%`, ...shift(d) }}>
            <div className="hero-float hero-pop" style={{ animationDelay: `${delay}s, ${0.2 + i * 0.09}s` }}>
              <div className="hero-icon pointer-events-auto" style={{ "--o": 0.55 + d * 0.35 }}>
                <HexIcon name={name} size={size} />
                <span className="hero-tip">{LABELS[name]}</span>
              </div>
            </div>
          </div>
        ))}
        {NUMBERS.map(([t, x, y, d]) => (
          <div key={t} className="absolute parallax font-mono text-sm text-white/70" style={{ left: `${x}%`, top: `${y}%`, ...shift(d) }}>{t}</div>
        ))}
        {DOTS.map(([x, y], i) => (
          <span key={i} className="absolute parallax w-2 h-2 rounded-full border border-white/70" style={{ left: `${x}%`, top: `${y}%`, ...shift(0.7) }} />
        ))}
      </div>

      {/* content */}
      <div className="relative grid lg:grid-cols-[1fr_1fr] items-center gap-6 px-6 sm:px-12 pt-12 pb-8 sm:py-16 min-h-[620px]">
        <div className="relative z-10 hero-in">{children}</div>
        <div ref={globeBox} className="relative mx-auto w-full max-w-[520px] cursor-pointer globe-box"
             onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}>
          <Globe reduced={reduced} hot={hot && !reduced} />
          <p className="text-center -mt-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-sm text-white/90"><Icon name="pin" className="w-4 h-4" /> Sample forest: Nallamala hills, Andhra Pradesh</span></p>
        </div>
      </div>
    </section>
  );
}
