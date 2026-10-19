// Search box on the forest map: type a place (city, village, park) or "lat, lon" and the map flies there.
// Place names come from OpenStreetMap's free Nominatim service: searches run only when the user
// presses Enter or the button (their rule is at most about one search per second).
import { useRef, useState } from "react";
import { Icon } from "./Icon";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export default function MapSearch({ onGo }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [state, setState] = useState("idle"); // idle | busy | none | error
  const last = useRef(0);

  async function search(e) {
    e?.preventDefault();
    const text = q.trim();
    if (!text) return;
    const m = text.match(COORDS);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) {
      setResults([]); setState("idle");
      onGo({ lat: +m[1], lon: +m[2] });
      return;
    }
    if (Date.now() - last.current < 1100) return; // be polite to the free service
    last.current = Date.now();
    setState("busy");
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const list = res.ok ? await res.json() : [];
      setResults(list);
      setState(list.length ? "idle" : "none");
    } catch {
      setResults([]);
      setState("error");
    }
  }

  function pick(r) {
    setResults([]);
    setQ(r.display_name.split(",").slice(0, 2).join(","));
    const [s, n, w, e] = (r.boundingbox || []).map(Number);
    onGo({ lat: +r.lat, lon: +r.lon, bounds: r.boundingbox ? [[s, w], [n, e]] : null });
  }

  return (
    <div className="absolute z-[1000] top-3 left-14 right-3 sm:left-auto sm:w-80">
      <form onSubmit={search} className="flex items-center gap-1 rounded-xl bg-white/95 shadow-md border border-line px-2 py-1" role="search">
        <Icon name="search" className="w-4 h-4 text-moss shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); if (state !== "busy") setState("idle"); }}
          placeholder="Search a place, or type 16.11, 78.78"
          aria-label="Search a place on the map"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1.5"
        />
        <button type="submit" className="text-sm font-bold text-canopy px-2 py-1 rounded-lg hover:bg-leaf/10" disabled={state === "busy"}>
          {state === "busy" ? "…" : "Go"}
        </button>
      </form>
      {results.length > 0 && (
        <ul className="mt-1 rounded-xl bg-white shadow-lg border border-line overflow-hidden text-sm">
          {results.map((r) => (
            <li key={r.place_id}>
              <button type="button" onClick={() => pick(r)} className="w-full text-left px-3 py-2 hover:bg-leaf/10 border-b border-line last:border-0">
                {r.display_name}
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-[11px] muted bg-white">Search © OpenStreetMap contributors</li>
        </ul>
      )}
      {state === "none" && <p className="mt-1 rounded-lg bg-white/95 px-3 py-1.5 text-sm shadow">No place found. Try a nearby town.</p>}
      {state === "error" && <p className="mt-1 rounded-lg bg-white/95 px-3 py-1.5 text-sm shadow">Place search is not reachable right now. You can still type coordinates.</p>}
    </div>
  );
}
