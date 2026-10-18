// Evidence for one project: files with automatic warnings, impact claims, and the human review.
// Owners can add files and claims; verifiers can record a decision. Warnings never decide anything.
import { useEffect, useState } from "react";
import { addClaim, addEvidence, addReview, evidenceFileUrl, getEvidence } from "../lib/api";
import { DECISION_TEXT } from "./Passport";
import { IconTile } from "./Icon";

const KIND_ICON = { photo: "camera", report: "report", monitoring: "chart", location: "pin" };
const LEVEL = {
  high: "bg-ember/10 text-ember border-ember/30",
  medium: "bg-amberleaf/10 text-[#8A5410] border-amberleaf/30",
  low: "bg-mist/10 text-mist border-mist/30",
};

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("The file could not be read"));
    r.readAsDataURL(file);
  });
}

function UploadForm({ p, onDone }) {
  const [kind, setKind] = useState("photo");
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState({ busy: false, error: "", ok: "" });
  async function send(e) {
    e.preventDefault();
    if (!file) return;
    setState({ busy: true, error: "", ok: "" });
    try {
      const data = await readFile(file);
      const item = await addEvidence(p.id, { kind, name: file.name, mime: file.type, data_b64: data, note, check_id: p.checkId });
      setState({ busy: false, error: "", ok: item.flags.length ? `Added. ${item.flags.length} warning(s) for the reviewer to look at.` : "Added. No warnings." });
      setFile(null); setNote(""); e.target.reset();
      onDone();
    } catch (err) { setState({ busy: false, error: err.message, ok: "" }); }
  }
  return (
    <form onSubmit={send} className="rounded-2xl border border-line bg-white p-4 space-y-3">
      <div className="font-bold">Add evidence</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">What is it?
          <select className="field mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="photo">Photo of the forest</option>
            <option value="report">Report (PDF or document)</option>
            <option value="monitoring">Monitoring data (CSV)</option>
            <option value="location">Location file (GeoJSON or KML)</option>
          </select>
        </label>
        <label className="text-sm">File (up to 5 MB)
          <input className="field mt-1" type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <label className="text-sm block">Short note (optional)
        <input className="field mt-1" value={note} maxLength={300} placeholder="For example: north edge, taken by the forest guard" onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="text-xs muted">Photos with GPS work best: we check that they were taken inside the forest. Each file gets a fingerprint, so the same file cannot quietly support two projects.</p>
      <button className="btn-main" disabled={state.busy || !file}>{state.busy ? "Adding…" : "Add file"}</button>
      {state.ok && <p className="text-sm font-bold text-leaf">{state.ok}</p>}
      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}
    </form>
  );
}

function ClaimForm({ p, cats, onDone }) {
  const [c, setC] = useState({ category: "community", value: "", unit: "", text: "" });
  const [state, setState] = useState({ busy: false, error: "" });
  async function send(e) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      await addClaim(p.id, { ...c, value: c.value === "" ? null : Number(c.value) });
      setC({ category: c.category, value: "", unit: "", text: "" });
      setState({ busy: false, error: "" });
      onDone();
    } catch (err) { setState({ busy: false, error: err.message }); }
  }
  return (
    <form onSubmit={send} className="rounded-2xl border border-line bg-white p-4 space-y-3">
      <div className="font-bold">Add a benefit claim</div>
      <p className="text-xs muted">Claims are shown as “not verified” until a reviewer supports them with evidence.</p>
      <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2">
        <select className="field" value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}>
          {Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="field" type="number" placeholder="Number" value={c.value} onChange={(e) => setC({ ...c, value: e.target.value })} />
        <input className="field" placeholder="Unit" value={c.unit} maxLength={30} onChange={(e) => setC({ ...c, unit: e.target.value })} />
      </div>
      <input className="field" required placeholder="For example: 12 local forest guards hired" value={c.text} maxLength={300} onChange={(e) => setC({ ...c, text: e.target.value })} />
      <button className="btn-quiet" disabled={state.busy}>{state.busy ? "Saving…" : "Add claim"}</button>
      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}
    </form>
  );
}

function ReviewForm({ p, data, onDone }) {
  const [decision, setDecision] = useState("approved");
  const [note, setNote] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [supported, setSupported] = useState([]);
  const [state, setState] = useState({ busy: false, error: "", ok: "" });
  async function send(e) {
    e.preventDefault();
    setState({ busy: true, error: "", ok: "" });
    try {
      const r = await addReview(p.id, { decision, note, reviewer, supported_claims: supported });
      setState({ busy: false, error: "", ok: `Saved. Review fingerprint ${r.fingerprint.slice(0, 14)}…` });
      onDone();
    } catch (err) { setState({ busy: false, error: err.message, ok: "" }); }
  }
  return (
    <form onSubmit={send} className="rounded-2xl border-2 border-leaf/40 bg-leaf/5 p-4 space-y-3">
      <div className="font-bold">Your review</div>
      <p className="text-xs muted">Look at the files and warnings above, then decide. The warnings only point out things worth a closer look.</p>
      <div className="grid sm:grid-cols-3 gap-2">
        {[["approved", "✓ Approve evidence"], ["more_needed", "? Ask for more"], ["rejected", "✕ Reject"]].map(([k, label]) => (
          <label key={k} className={`choice cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold ${decision === k ? "border-leaf bg-white" : "border-line bg-white/60"}`}>
            <input type="radio" name={`d-${p.id}`} className="sr-only" checked={decision === k} onChange={() => setDecision(k)} />{label}
          </label>
        ))}
      </div>
      {data.claims.length > 0 && (
        <fieldset className="text-sm">
          <legend className="font-bold mb-1">Claims the evidence supports</legend>
          {data.claims.map((c) => (
            <label key={c.id} className="flex gap-2 items-start">
              <input type="checkbox" className="mt-1" checked={supported.includes(c.id)}
                     onChange={(e) => setSupported(e.target.checked ? [...supported, c.id] : supported.filter((x) => x !== c.id))} />
              <span>{c.text}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="grid sm:grid-cols-[1fr_2fr] gap-2">
        <input className="field" placeholder="Your name" value={reviewer} maxLength={80} onChange={(e) => setReviewer(e.target.value)} />
        <input className="field" placeholder="Reason (shown publicly)" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className="btn-main" disabled={state.busy}>{state.busy ? "Saving…" : "Save review"}</button>
      {state.ok && <p className="text-sm font-bold text-leaf">{state.ok}</p>}
      {state.error && <p role="alert" className="text-sm text-ember">{state.error}</p>}
      <p className="text-xs muted">Prototype: anyone can open this panel. A real system would only let accredited reviewers sign in.</p>
    </form>
  );
}

export default function EvidencePanel({ p, role = "public", onLoaded, compact = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = () => getEvidence(p.id, p.checkId).then((d) => { setData(d); onLoaded?.(d); }).catch((e) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [p.id]);

  if (error) return <section className="panel p-5"><h2 className="text-xl font-bold">Evidence</h2><p className="text-sm muted mt-2">The evidence store could not be reached: {error}</p></section>;
  if (!data) return <section className="panel p-5"><p className="muted">Loading evidence…</p></section>;

  return (
    <section className="panel p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Evidence from the ground</h2>
          <p className="text-sm muted">{data.completeness.have} of {data.completeness.of} kinds on record · {data.review ? DECISION_TEXT[data.review.decision] : "not reviewed yet"}</p>
        </div>
        <div className="flex gap-1">
          {Object.keys(data.kinds).map((k) => (
            <span key={k} title={`${data.kinds[k]}${data.kinds_present.includes(k) ? ": on record" : ": missing"}`}><IconTile name={KIND_ICON[k]} size="sm" tone={data.kinds_present.includes(k) ? "green" : "grey"} className={data.kinds_present.includes(k) ? "" : "opacity-60"} /></span>
          ))}
        </div>
      </div>

      {data.flags.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-bold">Automatic warnings, for a person to look at</div>
          {data.flags.map((f, i) => (
            <div key={i} className={`text-sm rounded-xl border px-3 py-2 ${LEVEL[f.level]}`}>
              <b className="uppercase text-[11px] tracking-wide mr-1">{f.level}</b>{f.file && <span className="font-bold">{f.file}: </span>}{f.text}
            </div>
          ))}
        </div>
      )}

      {data.items.length === 0 ? <p className="text-sm muted">No files yet.</p> : (
        <ul className={`grid ${compact ? "" : "sm:grid-cols-2"} gap-3`}>
          {data.items.map((x) => (
            <li key={x.id} className="choice rounded-xl border border-line bg-white p-3 flex gap-3">
              {x.mime.startsWith("image/") ? (
                <img src={evidenceFileUrl(p.id, x.file)} alt={x.name} className="w-16 h-16 rounded-lg object-cover border border-line" />
              ) : <IconTile name={KIND_ICON[x.kind]} size="xl" />}
              <div className="min-w-0 text-sm">
                <a className="font-bold underline break-all" href={evidenceFileUrl(p.id, x.file)} target="_blank" rel="noreferrer">{x.name}</a>
                <div className="muted">{data.kinds[x.kind]} · {(x.size / 1024).toFixed(0)} KB · {x.added_at}</div>
                {x.note && <div>{x.note}</div>}
                <div className="text-xs muted mono">sha256 {x.sha256.slice(0, 16)}…</div>
                <div className="text-xs mt-1">{x.flags.length ? <span className="text-[#8A5410] font-bold">{x.flags.length} warning{x.flags.length > 1 ? "s" : ""}</span> : <span className="text-leaf font-bold">No warnings</span>}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.review && (
        <div className="rounded-xl bg-lichen p-3 text-sm">
          <b>Latest review:</b> {DECISION_TEXT[data.review.decision]} by {data.review.reviewer} on {data.review.at}. {data.review.note}
        </div>
      )}

      {role === "owner" && <div className="grid lg:grid-cols-2 gap-3"><UploadForm p={p} onDone={load} /><ClaimForm p={p} cats={data.claim_categories} onDone={load} /></div>}
      {role === "verifier" && <ReviewForm p={p} data={data} onDone={load} />}
    </section>
  );
}
