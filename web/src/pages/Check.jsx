// Screen 1: Check a forest.
import { useEffect, useMemo, useState } from "react";
import ForestMap from "../components/ForestMap";
import Brush from "../components/Brush";
import { Icon } from "../components/Icon";
import Progress from "../components/Progress";
import VerdictCard from "../components/VerdictCard";
import HowCalculated from "../components/HowCalculated";
import CheckAudit from "../components/CheckAudit";
import CreateCredits from "../components/CreateCredits";
import { Hex, Orb, VERDICTS } from "../components/Verdict";
import VerdictGuide from "../components/VerdictGuide";
import { fileUrl, getCheck, getSamples, runCheck } from "../lib/api";
import { forgetChecks, recentChecks, rememberCheck, saveForestName, savedForestName, timeAgo } from "../lib/history";
import { useSearchParams } from "react-router-dom";
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
  const [liveRun, setLiveRun] = useState(false);
  const [forestName, setForestName] = useState(savedForestName);
  const [recent, setRecent] = useState(recentChecks);
  const [params] = useSearchParams();

  useEffect(() => {
    getSamples().then((s) => { setSamples(s); if (s[0]) setSelectedId(s[0].id); }).catch((e) => setLoadError(e.message));
  }, []);

  const sample = samples.find((s) => s.id === selectedId);
  const boundary = drawn || sample?.boundary || null;
  const cells = useMemo(() => cellsGeoJSON(boundary), [boundary]);

  // Re-open one of "Your recent checks" (or a link like /check?open=<id> from the intro page).
  async function openSaved(item) {
    setError(""); setPayload(null); setRunning(true); setLiveRun(false);
    try {
      const p = await getCheck(item.check_id);
      if (item.sample_id) { setSelectedId(item.sample_id); setDrawn(null); }
      else if (p.boundary) { setDrawn(p.boundary); setSelectedId(null); setForestName(item.name); }
      setPayload({ ...p, cached: Boolean(item.sample_id) });
    } catch (e) {
      setError(`This saved check could not be opened: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    const id = params.get("open");
    const item = id && recentChecks().find((x) => x.check_id === id);
    if (item) openSaved(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickSample(id) { setSelectedId(id); setDrawn(null); setPayload(null); setError(""); }
  function onDraw(geom) { setDrawn(geom); if (geom) setSelectedId(null); setPayload(null); setError(""); }

  async function check(live = false) {
    setLiveRun(live || !!drawn || !samples.find((x) => x.id === selectedId)?.cached);
    setRunning(true); setPayload(null); setError("");
    try {
      const body = drawn ? { boundary: drawn, before, after } : { sample_id: selectedId, live };
      const p = await runCheck(body);
      setPayload(p);
      if (p.check_id) {
        rememberCheck(p, drawn ? (forestName.trim() || "My forest") : sample?.name, drawn ? null : selectedId);
        setRecent(recentChecks());
        if (drawn && forestName.trim()) saveForestName(forestName.trim());
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const name = drawn ? (forestName.trim() || "My forest") : (sample?.name || "Forest");
  const r = payload?.result;

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.05]"><span className="brush-wrap">Check a forest<Brush /></span></h1>
        <p className="mt-5 text-lg muted">Pick a forest, press check, and get one clear answer you can prove.</p>
      </header>


      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="h-[380px] sm:h-[520px] lg:sticky lg:top-24">
          <ForestMap samples={samples} selectedId={selectedId} onSelectSample={pickSample} onDraw={onDraw}
                     boundary={boundary} cells={cells} claimedCells={payload?.claimed_cells || []} />
        </div>

        <div className="space-y-5">
          <section className="panel p-5 space-y-4">
            {recent.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">Your recent checks</h2>
                  <button className="text-sm muted underline" onClick={() => { forgetChecks(); setRecent([]); }}>Clear</button>
                </div>
                <p className="text-xs muted mt-0.5">Saved only in this browser. Press one to open its result again.</p>
                <div className="grid gap-2 mt-2">
                  {recent.map((x) => {
                    const v = VERDICTS[x.verdict] || VERDICTS.None;
                    return (
                      <button key={x.check_id} onClick={() => openSaved(x)} disabled={running}
                        className="choice flex items-center gap-3 text-left rounded-xl border border-line bg-white px-3 py-2 min-h-[48px]">
                        <Orb className={`w-8 h-8 ${v.bg} text-white text-sm font-bold shrink-0`}>{v.icon}</Orb>
                        <span className="flex-1 min-w-0">
                          <span className="block font-bold truncate">{x.name}</span>
                          <span className="block text-xs muted">{v.label}{x.verdict === "Verified" ? ` · ${x.credits} credits` : ""} · {timeAgo(x.at)}</span>
                        </span>
                        <span className="muted" aria-hidden>›</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <h2 className="text-xl font-bold">Choose a forest</h2>
            {loadError && <p role="alert" className="text-ember">{loadError}</p>}
            <div className="grid gap-2">
              {samples.map((s) => (
                <button key={s.id} onClick={() => pickSample(s.id)}
                  className={`choice text-left rounded-xl border px-4 py-3 min-h-[48px] transition-colors ${s.id === selectedId ? "border-leaf bg-leaf/5" : "border-line bg-white hover:border-moss"}`}>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-sm muted">{s.description}</div>
                  <div className={`text-xs font-bold mt-1 ${s.cached ? "text-leaf" : "text-amberleaf"}`}>
                    <span className="inline-flex items-center gap-1"><Icon name={s.cached ? "bolt" : "satellite"} className="w-3.5 h-3.5" />{s.cached ? "Saved result: opens in a second" : "Live check: about 1 to 2 minutes"}</span>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-sm muted">Or draw your own area with the shape tools on the map (up to about 30 km²). A drawn area is always a live check, about 1 to 2 minutes.</p>
            {drawn && (
              <label className="block text-sm font-bold">Name this forest <span className="font-normal muted">(optional)</span>
                <input className="field mt-1" value={forestName} maxLength={60} placeholder="For example: Our village forest"
                       onChange={(e) => setForestName(e.target.value)} />
                <span className="block font-normal muted text-xs mt-1">Used on your result, your share message and your credits.</span>
              </label>
            )}
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
            {cells && <p className="text-sm"><Hex className="w-4 h-4 bg-leaf align-middle mr-1" /> {cells.count} map cells will be claimed on the blockchain.</p>}
            <button className="btn-main w-full text-lg" disabled={!boundary || running} onClick={() => check(false)}>
              {running ? "Checking…" : "Check this forest"}
            </button>
            {(running || payload?.timings) && <Progress running={running} timings={payload?.timings} live={liveRun} />}
            {error && <p role="alert" className="text-ember font-bold">{error}</p>}
          </section>

          {payload && <VerdictCard payload={payload} name={name} />}
          {!payload && !running && <VerdictGuide />}
          {payload?.cached && <button className="btn-quiet w-full" onClick={() => check(true)} disabled={running}>Check again live (about 1 to 2 minutes)</button>}
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
            <CheckAudit payload={payload} />
          </div>
          <div className="space-y-5">
            {payload.explanation && (
              <section className="panel p-5">
                <h2 className="text-xl font-bold mb-2">Summary</h2>
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
