// Screen 1: Check a forest.
import { useEffect, useMemo, useState } from "react";
import ForestMap from "../components/ForestMap";
import Progress from "../components/Progress";
import VerdictCard from "../components/VerdictCard";
import HowCalculated from "../components/HowCalculated";
import CreateCredits from "../components/CreateCredits";
import { Hex } from "../components/Verdict";
import { fileUrl, getSamples, runCheck } from "../lib/api";
import { cellsGeoJSON } from "../lib/cells";

const DEFAULT_BEFORE = ["2025-01-01", "2025-03-31"];
const DEFAULT_AFTER = ["2026-01-01", "2026-03-31"];

export default function Check() {
  const [samples, setSamples] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [drawn, setDrawn] = useState(null);
  const [before, setBefore] = useState(DEFAULT_BEFORE);
  const [after, setAfter] = useState(DEFAULT_AFTER);
  const [running, setRunning] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getSamples().then((s) => { setSamples(s); if (s[0]) setSelectedId(s[0].id); }).catch((e) => setLoadError(e.message));
  }, []);

  const sample = samples.find((s) => s.id === selectedId);
  const boundary = drawn || sample?.boundary || null;
  const cells = useMemo(() => cellsGeoJSON(boundary), [boundary]);

  function pickSample(id) { setSelectedId(id); setDrawn(null); setPayload(null); setError(""); }
  function onDraw(geom) { setDrawn(geom); if (geom) setSelectedId(null); setPayload(null); setError(""); }

  async function check(live = false) {
    setRunning(true); setPayload(null); setError("");
    try {
      const body = drawn ? { boundary: drawn, before, after } : { sample_id: selectedId, live };
      setPayload(await runCheck(body));
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const name = sample?.name || "Drawn forest";
  const r = payload?.result;

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.05]">Satellites verify. The contract decides. No credit counts twice.</h1>
        <p className="mt-3 text-lg muted">Pick a forest, press check, and get one clear answer you can prove.</p>
      </header>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="h-[380px] sm:h-[520px] lg:sticky lg:top-24">
          <ForestMap samples={samples} selectedId={selectedId} onSelectSample={pickSample} onDraw={onDraw}
                     boundary={boundary} cells={cells} claimedCells={payload?.claimed_cells || []} />
        </div>

        <div className="space-y-5">
          <section className="panel p-5 space-y-4">
            <h2 className="text-xl font-bold">Choose a forest</h2>
            {loadError && <p role="alert" className="text-ember">{loadError}</p>}
            <div className="grid gap-2">
              {samples.map((s) => (
                <button key={s.id} onClick={() => pickSample(s.id)}
                  className={`text-left rounded-xl border px-4 py-3 min-h-[48px] transition-colors ${s.id === selectedId ? "border-leaf bg-leaf/5" : "border-line bg-white hover:border-moss"}`}>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-sm muted">{s.description}</div>
                </button>
              ))}
            </div>
            <p className="text-sm muted">Or draw your own area with the shape tools on the map (up to about 30 km²).</p>
            {drawn && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label>Before (from – to)
                  <input className="field mt-1" type="date" value={before[0]} onChange={(e) => setBefore([e.target.value, before[1]])} />
                  <input className="field mt-1" type="date" value={before[1]} onChange={(e) => setBefore([before[0], e.target.value])} />
                </label>
                <label>After (from – to)
                  <input className="field mt-1" type="date" value={after[0]} onChange={(e) => setAfter([e.target.value, after[1]])} />
                  <input className="field mt-1" type="date" value={after[1]} onChange={(e) => setAfter([after[0], e.target.value])} />
                </label>
              </div>
            )}
            {cells && <p className="text-sm"><Hex className="w-4 h-4 bg-canopy align-middle mr-1" /> {cells.count} map cells will be claimed on the blockchain.</p>}
            <button className="btn-main w-full text-lg" disabled={!boundary || running} onClick={() => check(false)}>
              {running ? "Checking…" : "Check this forest"}
            </button>
            {(running || payload?.timings) && <Progress running={running} timings={payload?.timings} />}
            {error && <p role="alert" className="text-ember font-bold">{error}</p>}
          </section>

          {payload && <VerdictCard payload={payload} />}
          {payload?.cached && <button className="btn-quiet w-full" onClick={() => check(true)} disabled={running}>Check again live</button>}
        </div>
      </div>

      {payload?.check_id && (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
          <div className="space-y-5">
            <section className="panel p-5">
              <h2 className="text-xl font-bold mb-3">What the satellites saw</h2>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[["before.png", `Before (${payload.windows.before.join(" to ")})`], ["after.png", `After (${payload.windows.after.join(" to ")})`], ["map.png", "Forest map"]].map(([f, label]) => (
                  <figure key={f}>
                    <img src={fileUrl(payload.check_id, f)} alt={label} className="w-full aspect-square object-cover rounded-xl border border-line bg-white" style={{ imageRendering: "pixelated" }} />
                    <figcaption className="text-sm muted mt-1">{label}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-sm muted mt-3">Forest map: green is forest, red is tree loss, grey is hidden by cloud, sand is open land.</p>
            </section>
            <HowCalculated payload={payload} />
          </div>
          <div className="space-y-5">
            {payload.explanation && (
              <section className="panel p-5">
                <h2 className="text-xl font-bold mb-2">In plain words</h2>
                <p className="leading-relaxed">{payload.explanation.text}</p>
                <p className="text-sm muted mt-2">
                  {payload.explanation.source === "ai"
                    ? "Written by AI from the numbers above. Every number was checked against the result."
                    : "Standard explanation built from the numbers above."}
                </p>
              </section>
            )}
            {r.verdict === "Verified" && r.credits.credits > 0 && <CreateCredits payload={payload} name={name} />}
          </div>
        </div>
      )}
    </div>
  );
}
