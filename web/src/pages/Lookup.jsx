// Screen 3: Look up a credit. Timeline, "Re-run this check", new satellite check, and "Try to cheat".
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CheatPanel from "../components/CheatPanel";
import { ForestBadge, Hex, VerdictBadge } from "../components/Verdict";
import { getCheckByRecipe, recheck, rerunCheck } from "../lib/api";
import { VERDICT_NAMES, explainError, getProject, hasChain, parseMeta, projectHistory, reader, short, txUrl } from "../lib/chain";

const date = (t) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function describe(e) {
  const a = e.args;
  switch (e.name) {
    case "ProjectRegistered": return ["Forest registered", `${a.cells.length} map cells claimed by ${short(a.owner)}`];
    case "VerificationRecorded": return ["Checked by satellites", `Verdict: ${VERDICT_NAMES[Number(a.verdict)]}, up to ${a.maxCredits} credits`];
    case "CreditsIssued": return ["Credits created", `${a.amount} credits`];
    case "CreditsBought": return ["Credits sold", `${a.amount} credits to ${short(a.buyer)}`];
    case "CreditsRetired": return ["Credits retired", `${a.amount} credits for “${a.beneficiary}” (certificate R-${a.retirementId})`];
    case "Rechecked": return ["Checked again", `Tree loss ${Number(a.lossBps) / 100}%`];
    case "ProjectFrozen": return ["Frozen", "Major forest loss found, remaining credits frozen"];
    default: return [e.name, ""];
  }
}

function Timeline({ history }) {
  return (
    <ol className="relative border-l-2 border-line ml-3 space-y-5">
      {history.map((e) => {
        const [title, detail] = describe(e);
        const bad = e.name === "ProjectFrozen";
        return (
          <li key={`${e.tx}-${e.index}`} className="pl-6 relative">
            <Hex className={`absolute -left-[11px] top-1 w-5 h-5 ${bad ? "bg-ember" : "bg-canopy"}`} />
            <div className="font-bold">{title}</div>
            <div>{detail}</div>
            <div className="text-sm muted">{date(e.time)}, <a className="underline" href={txUrl(e.tx)} target="_blank" rel="noreferrer">transaction</a></div>
          </li>
        );
      })}
    </ol>
  );
}

function Proof({ project }) {
  const [check, setCheck] = useState(null);
  const [state, setState] = useState({ busy: false, out: null, error: "" });

  useEffect(() => {
    getCheckByRecipe(project.recipeHash).then(setCheck).catch(() => setCheck(false));
  }, [project.recipeHash]);

  async function run() {
    setState({ busy: true, out: null, error: "" });
    try { setState({ busy: false, out: await rerunCheck(check.check_id), error: "" }); }
    catch (e) { setState({ busy: false, out: null, error: e.message }); }
  }

  const out = state.out;
  const matchesChain = out && out.result_hash === project.resultHash;
  return (
    <section className="panel p-5 space-y-3">
      <h2 className="text-2xl font-bold">Don't trust us. Re-run it.</h2>
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
  const [project, setProject] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    getProject(id).then(setProject).catch((e) => setError(explainError(e).text));
    projectHistory(id).then(setHistory).catch(() => setHistory([]));
  };
  useEffect(load, [id]);

  if (error) return <p role="alert" className="text-ember font-bold">{error}</p>;
  if (!project) return <p className="muted">Reading the blockchain…</p>;
  const meta = parseMeta(project.metadataURI);
  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
      <div className="space-y-6">
        <section className="panel p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h2 className="text-3xl font-extrabold">GP-{project.id}</h2>
              {meta.name && <p className="muted">{meta.name}</p>}
            </div>
            <ForestBadge frozen={project.frozen} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-sm muted">Last verdict</div><VerdictBadge verdict={project.verdict} small /></div>
            <div><div className="text-sm muted">Credits</div><div className="font-bold mono">{project.issued} created, {project.retired} retired</div></div>
          </div>
          <h3 className="text-xl font-bold pt-2">The credit's story</h3>
          {history === null ? <p className="muted">Reading the history…</p> : <Timeline history={history} />}
        </section>
        <Proof project={project} />
      </div>
      <div className="space-y-6">
        <CheatPanel project={project} history={history} />
        <NewCheck project={project} onDone={load} />
      </div>
    </div>
  );
}

function RetirementView({ id }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    reader().getRetirement(id).then((x) => {
      if (Number(x.projectId) === 0) setError(`There is no certificate R-${id}.`);
      else setR(x);
    }).catch((e) => setError(explainError(e).text));
  }, [id]);
  if (error) return <p role="alert" className="text-ember font-bold">{error}</p>;
  if (!r) return <p className="muted">Reading the blockchain…</p>;
  return (
    <section className="max-w-2xl rounded-2xl border-2 border-leaf bg-white p-6 sm:p-8 space-y-3">
      <Hex className="w-14 h-14 bg-leaf text-white text-2xl">✓</Hex>
      <h2 className="text-3xl font-extrabold">Retirement certificate R-{id}</h2>
      <p className="text-lg"><b>{Number(r.amount)} tonnes of CO₂</b> from forest <Link className="underline" to={`/lookup?q=GP-${Number(r.projectId)}`}>GP-{Number(r.projectId)}</Link> were retired for <b>{r.beneficiary}</b> on {date(Number(r.at))}.</p>
      <p className="muted">Retired by {short(r.by)}. These credits were burned on the blockchain, so they can never be sold or retired again.</p>
    </section>
  );
}

export default function Lookup() {
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
      <header className="max-w-2xl">
        <h1 className="text-4xl font-extrabold">Look up a credit</h1>
        <p className="muted mt-1">Anyone can see where a credit came from, and check it themselves.</p>
        <form className="flex gap-3 mt-4" onSubmit={(e) => { e.preventDefault(); setParams({ q: text.trim() }); }}>
          <label className="sr-only" htmlFor="q">Credit or certificate number</label>
          <input id="q" className="field" placeholder="GP-1 or R-1" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-main whitespace-nowrap">Look up</button>
        </form>
      </header>
      {q && !m && <p className="text-ember">Please type a project number like GP-1, or a certificate number like R-1.</p>}
      {kind === "GP" && <ProjectView id={id} key={`gp-${id}`} />}
      {kind === "R" && <RetirementView id={id} key={`r-${id}`} />}
    </div>
  );
}
