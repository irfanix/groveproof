// Interactive climate map: every registered project drawn from its on-chain map cells,
// coloured by status, with filters. Click a project to open its credit passport.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary, isValidCell } from "h3-js";
import { Icon } from "./Icon";

const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STATUS = {
  verified: { label: "Verified", color: "#4ADE80" },
  review: { label: "Needs review", color: "#F59E0B" },
  pending: { label: "Waiting for a check", color: "#CBD5E1" },
  frozen: { label: "Frozen", color: "#F43F5E" },
  rejected: { label: "Not eligible", color: "#FB7185" },
};
const TYPES = [
  { key: "forest", icon: "forest", label: "Forests", on: true },
  { key: "energy", icon: "sun", label: "Renewable energy", on: false },
  { key: "waste", icon: "recycle", label: "Waste", on: false },
];

export const statusOf = (p) => (p.frozen ? "frozen" : p.verdict === "Verified" ? "verified" : p.verdict === "NeedsReview" || p.verdict === "CantCheckYet" ? "review" : p.verdict === "NotEligible" ? "rejected" : "pending");

export default function ClimateMap({ projects, height = 420 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const nav = useNavigate();
  const [filter, setFilter] = useState("all");

  const shapes = useMemo(() => projects.map((p) => ({
    p,
    status: statusOf(p),
    rings: p.cells.filter((h) => isValidCell(h)).map((h) => cellToBoundary(h)),
  })), [projects]);

  useEffect(() => {
    const m = L.map(el.current, { scrollWheelZoom: false }).setView([16.1, 78.8], 6);
    L.tileLayer(SATELLITE, { maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    const bounds = [];
    for (const s of shapes) {
      if (filter !== "all" && s.status !== filter) continue;
      if (!s.rings.length) continue;
      const st = STATUS[s.status];
      const poly = L.polygon(s.rings, { color: st.color, weight: 1.5, fillColor: st.color, fillOpacity: 0.35 });
      poly.bindTooltip(`<b>GP-${s.p.id} ${s.p.name}</b><br>${st.label} · ${s.p.issued} credits`, { sticky: true });
      poly.on("click", () => nav(`/lookup?q=GP-${s.p.id}`));
      poly.addTo(g);
      // A small project is only a few hexagons, too small to see when the map shows a whole state,
      // so each project also gets a pin at its centre.
      const pts = s.rings.flat();
      const c = [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
      const pin = L.circleMarker(c, { radius: 9, color: "#fff", weight: 2, fillColor: st.color, fillOpacity: 1 });
      pin.bindTooltip(`<b>GP-${s.p.id} ${s.p.name}</b><br>${st.label} · ${s.p.issued} credits`, { direction: "top" });
      pin.on("click", () => nav(`/lookup?q=GP-${s.p.id}`));
      pin.addTo(g);
      s.rings.forEach((r) => r.forEach((pt) => bounds.push(pt)));
    }
    if (bounds.length) map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [shapes, filter, nav]);

  const counts = shapes.reduce((c, s) => ({ ...c, [s.status]: (c[s.status] || 0) + 1 }), {});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <span key={t.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${t.on ? "bg-canopy text-white" : "bg-line/50 text-moss"}`} title={t.on ? "" : "Coming later: GroveProof checks forests today"}>
            <Icon name={t.icon} className="w-4 h-4" />{t.label}{t.on ? "" : " · later"}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("all")} className={`chip ${filter === "all" ? "chip-on" : ""}`}>All ({shapes.length})</button>
        {Object.entries(STATUS).filter(([k]) => counts[k]).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} className={`chip ${filter === k ? "chip-on" : ""}`}>
            <span className="w-2.5 h-2.5 rounded-full inline-block mr-1.5" style={{ background: v.color }} />{v.label} ({counts[k]})
          </button>
        ))}
      </div>
      <div ref={el} className="rounded-2xl overflow-hidden border border-line" style={{ height }} role="region" aria-label="Map of forest projects" />
      <p className="text-xs muted">Each shape is drawn from the map cells stored in the smart contract. Click a forest to open its credit passport.</p>
    </div>
  );
}
