// Screen: Look up a credit. A "credit passport" anyone can open by number or by scanning its QR code.
// It answers four questions in plain words, then shows trust checks, impact, evidence and the audit trail.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CheatPanel from "../components/CheatPanel";
import EvidencePanel from "../components/EvidencePanel";
import { ChainTrail, FourAnswers, Impact, TrustList } from "../components/Passport";
import { ForestBadge, Hex, VerdictBadge } from "../components/Verdict";
import { Lifecycle, Qr, dateOnly, date } from "../components/ui";
import { getCheck, getCheckByRecipe, recheck, rerunCheck } from "../lib/api";
import { explainError, hasChain, parseMeta, reader, short } from "../lib/chain";
import { findProject, loadRegistry, trustChecks } from "../lib/registry";
import { usePrefs } from "../lib/prefs";
import Brush from "../components/Brush";

function Proof({ project, onRerun }) {
  const [check, setCheck] = useState(null);
  const [state, setState] = useState({ busy: false, out: null, error: "" });

  useEffect(() => {
    getCheckByRecipe(project.recipeHash).then(setCheck).catch(() => setCheck(false));
  }, [project.recipeHash]);

  async function run() {
    setState({ busy: true, out: null, error: "" });
    try { const out = await rerunCheck(check.check_id); setState({ busy: false, out, error: "" }); onRerun?.(out.result_hash === project.resultHash); }
    catch (e) { setState({ busy: false, out: null, error: e.message }); }
  }

  const out = state.out;
  const matchesChain = out && out.result_hash === project.resultHash;
  return (
    <section className="panel p-5 space-y-3">
      <h2 className="text-2xl font-bold">Run this check again yourself</h2>
      <p className="muted">The exact recipe of the last check (satellite scenes, dates, rules, model) is fingerprinted on the blockchain. Re-running it downloads the same pictures and must give the same result.</p>
      <p className="text-sm">Recipe on-chain: <span className="mono break-all">{project.recipeHash}</span></p>
      <p className="text-sm">Result on-chain: <span className="mono break-all">{project.resultHash}</span></p>
      {check === false && <p className="muted">The saved recipe for this hash is not on this checker.</p>}
      {check && (
        <div className="flex flex-wrap gap-3">
          <button className="btn-main" disabled={state.busy} onClick={run}>{state.busy ? "Re-running (about a minute)…" : "Re-run this check"}</button>
          <a className="btn-quiet" href={`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/checks/${check.check_id}/recipe.json`} download>Download the recipe</a>
        </div>
      )}
      {state.error && <p role="alert" className="text-ember">{state.error}</p>}
      {out && (
        <p className={`text-lg font-bold ${matchesChain ? "text-leaf" : "text-ember"}`}>
          {matchesChain ? `✓ Same result as the blockchain record (${out.verdict}, ${out.credits} credits, ${out.seconds} s).`
                        : "✗ The re-run gave a different result from the blockchain record."}
        </p>
      )}
      <p className="text-sm muted">Or on your own computer: <span className="mono">python -m groveproof.rerun recipe.json result.json</span></p>
    </section>
  );
}

function NewCheck({ project, onDone }) {
  const [after, setAfter] = useState(["2026-10-01", "2026-12-31"]);
  const [state, setState] = useState({ busy: false, out: null, error: "" });
  async function run() {
    setState({ busy: true, out: null, error: "" });
    try {
      const c = await getCheckByRecipe(project.recipeHash).catch(() => null);
      const checkId = c?.check_id || parseMeta(project.metadataURI).checkId;
      const out = await recheck(project.id, { check_id: checkId, after });
      setState({ busy: false, out, error: "" });
      onDone();
    } catch (e) { setState({ busy: false, out: null, error: e.message }); }
  }
  const r = state.out?.result;
  return (
    <section className="panel p-5 space-y-3">
      <h2 className="text-2xl font-bold">Check this forest again</h2>
      <p className="muted">Living credits: newer satellite pictures are compared with the last check. If 5% or more of the forest is gone, the contract freezes the remaining credits.</p>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <label className="text-sm">New pictures from<input className="field mt-1" type="date" value={after[0]} onChange={(e) => setAfter([e.target.value, after[1]])} /></label>
        <label className="text-sm">to<input className="field mt-1" type="date" value={after[1]} onChange={(e) => setAfter([after[0], e.target.value])} /></label>
      </div>
      <button className="btn-quiet" disabled={state.busy || project.frozen} onClick={run}>{state.busy ? "Checking with satellites…" : "Check again"}</button>
      {state.error && <p role="alert" className="text-ember">{state.error}</p>}
      {r && <p className="font-bold">Tree loss {r.numbers.loss_pct}%. {state.out.will_freeze ? "The project is now frozen." : "The forest is still healthy."}</p>}
    </section>
  );
}


function ProjectView({ id }) {
  const { prefs, t, expert } = usePrefs();
  const [p, setP] = useState(null);
  const [check, setCheck] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [rerun, setRerun] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = (force = false) => {
    setError("");
    loadRegistry(force).then((reg) => {
      const found = findProject(reg, id);
      if (!found) { setError(`There is no project GP-${id}.`); return; }
      setP(found);
      if (found.checkId) getCheck(found.checkId).then(setCheck).catch(() => setCheck(null));
      else getCheckByRecipe(found.recipeHash).then(setCheck).catch(() => setCheck(null));
    }).catch((e) => setError(explainError(e).text));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [id]);

  if (error) return <p role="alert" className="text-ember font-bold">{error}</p>;
  if (!p) return <p className="muted">Reading the blockchain…</p>;
  const trust = trustChecks(p, { evidence, check, rerun });
  const link = `${window.location.origin}/lookup?q=GP-${p.id}`;
  const role = prefs.role === "owner" || prefs.role === "verifier" ? prefs.role : "public";

  return (
    <div className="space-y-6">
      <section className="panel p-6 passport-head">
        <div className="flex flex-col md:flex-row gap-6 justify-between">
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-[0.18em] uppercase text-leaf">Credit passport</div>
            <h2 className="text-4xl sm:text-5xl font-extrabold leading-none">GP-{p.id}</h2>
            <p className="text-lg muted">{p.name}</p>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="rounded-full bg-canopy text-white text-sm font-bold px-3 py-1">{t(`stage.${p.stageName}`)}</span>
              <ForestBadge frozen={p.frozen} />
              <VerdictBadge verdict={p.verdict} small round />
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm pt-2">
              <div><dt className="muted">Credits created</dt><dd className="font-bold mono">{p.issued} of {p.maxCredits}</dd></div>
              <div><dt className="muted">Retired</dt><dd className="font-bold mono">{p.retired}</dd></div>
              <div><dt className="muted">Owner</dt><dd className="font-bold mono">{short(p.owner)}</dd></div>
              <div><dt className="muted">Registered</dt><dd className="font-bold">{dateOnly(p.registeredAt)}</dd></div>
            </dl>
            <p className="text-xs muted">One credit = one tonne of CO₂. All {p.issued} credits of this forest share the ID GP-{p.id}; the contract keeps the exact count each wallet holds, so no credit can exist twice.</p>
          </div>
          <div className="flex md:flex-col items-center gap-3 shrink-0">
            <Qr text={link} label="Scan with a phone camera to open this passport" />
            <div className="flex md:flex-col gap-2">
              <button className="btn-quiet text-sm" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy link"}</button>
              <button className="btn-quiet text-sm" onClick={() => window.print()}>Print</button>
            </div>
          </div>
        </div>
      </section>

      <FourAnswers p={p} trust={trust} evidence={evidence} check={check} you={prefs.wallet} />

      <section className="panel p-5">
        <h2 className="text-xl font-bold mb-4">Where these credits are now</h2>
        <Lifecycle project={p} />
      </section>

      <TrustList trust={trust} />
      <Impact p={p} check={check} evidence={evidence} />
      <EvidencePanel p={p} role={role} onLoaded={setEvidence} />
      <ChainTrail p={p} />

      <details className="panel p-5 group" open={expert}>
        <summary className="cursor-pointer list-none flex items-center justify-between">
          <span><span className="text-xl font-bold">Expert tools</span><span className="block text-sm muted">Re-run the exact check, check the forest again, or try to cheat the contract.</span></span>
          <span className="muted group-open:rotate-90 transition-transform text-xl">›</span>
        </summary>
        <div className="grid lg:grid-cols-2 gap-6 mt-5 items-start">
          <div className="space-y-6"><Proof project={p} onRerun={setRerun} /><NewCheck project={p} onDone={() => load(true)} /></div>
          <CheatPanel project={p} history={p.events} />
        </div>
      </details>
    </div>
  );
}

function RetirementView({ id }) {
  const [r, setR] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    reader().getRetirement(id).then((x) => {
      if (Number(x.projectId) === 0) setError(`There is no certificate R-${id}.`);
      else {
        setR(x);
        reader().getProject(x.projectId).then((p) => setName(parseMeta(p.metadataURI).name)).catch(() => {});
      }
    }).catch((e) => setError(explainError(e).text));
  }, [id]);
  if (error) return <p role="alert" className="text-ember font-bold">{error}</p>;
  if (!r) return <p className="muted">Reading the blockchain…</p>;
  const link = `${window.location.origin}/lookup?q=R-${id}`;
  return (
    <section className="certificate max-w-3xl rounded-[28px] bg-white p-6 sm:p-10">
      <div className="flex flex-col sm:flex-row justify-between gap-6">
        <div className="space-y-3">
          <Hex className="w-14 h-14 bg-leaf text-white text-2xl">✓</Hex>
          <div className="text-xs font-bold tracking-[0.18em] uppercase text-leaf">Retirement certificate</div>
          <h2 className="text-4xl font-extrabold">R-{id}</h2>
          <p className="text-lg"><b>{Number(r.amount)} tonnes of CO₂</b> from <Link className="underline" to={`/lookup?q=GP-${Number(r.projectId)}`}>GP-{Number(r.projectId)}{name ? ` ${name}` : ""}</Link> were retired for <b>{r.beneficiary}</b> on {date(Number(r.at))}.</p>
          <p className="muted">Retired by {short(r.by)}. These credits were burned on the blockchain, so they can never be sold or retired again.</p>
        </div>
        <Qr text={link} label="Scan to check this certificate" />
      </div>
      <button className="btn-quiet mt-6 print:hidden" onClick={() => window.print()}>Print certificate</button>
    </section>
  );
}

function AllProjects() {
  const [reg, setReg] = useState(null);
  useEffect(() => { loadRegistry().then(setReg).catch(() => setReg(false)); }, []);
  if (!reg) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">All credits on record</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {reg.projects.map((p) => (
          <Link key={p.id} to={`/lookup?q=GP-${p.id}`} className="choice panel p-4 flex items-center justify-between gap-3">
            <span><span className="font-display font-extrabold text-xl">GP-{p.id}</span><span className="block text-sm muted">{p.name}</span></span>
            <span className="text-right text-sm"><span className="block font-bold">{p.stageName}</span><span className="muted">{p.issued} credits</span></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Lookup() {
  const { t } = usePrefs();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim().toUpperCase();
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const m = q.match(/^(GP|R)?-?(\d+)$/);
  const kind = m ? (m[1] === "R" ? "R" : "GP") : null;
  const id = m ? Number(m[2]) : null;

  if (!hasChain()) return <p className="panel p-5">The smart contract is not deployed yet. Deploy it first (see the README).</p>;

  return (
    <div className="space-y-6">
      <header className="max-w-2xl print:hidden">
        <h1 className="text-4xl sm:text-5xl font-extrabold"><span className="brush-wrap">{t("lookup.title")}<Brush /></span></h1>
        <p className="muted mt-5">{t("lookup.sub")}</p>
        <form className="flex gap-3 mt-4" onSubmit={(e) => { e.preventDefault(); setParams({ q: text.trim() }); }}>
          <label className="sr-only" htmlFor="q">Credit or certificate number</label>
          <input id="q" className="field" placeholder="GP-1 or R-1" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-main whitespace-nowrap">Look up</button>
        </form>
      </header>
      {q && !m && <p className="text-ember">Please type a project number like GP-1, or a certificate number like R-1.</p>}
      {!q && <AllProjects />}
      {kind === "GP" && <ProjectView id={id} key={`gp-${id}`} />}
      {kind === "R" && <RetirementView id={id} key={`r-${id}`} />}
    </div>
  );
}
