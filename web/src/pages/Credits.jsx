// Screen 2: My credits. See projects, buy credits, retire them and get a certificate.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ForestBadge, VerdictBadge } from "../components/Verdict";
import { connectWallet, deployment, explainError, hasChain, listProjects, parseMeta, priceText, reader, sendTx, short, txUrl } from "../lib/chain";

function ProjectCard({ p, wallet, onChanged }) {
  const [amount, setAmount] = useState(1);
  const [who, setWho] = useState("");
  const [state, setState] = useState({ busy: false, msg: "", error: "", cert: null });
  const meta = parseMeta(p.metadataURI);
  const isOwner = wallet && wallet.address.toLowerCase() === p.owner.toLowerCase();

  async function act(kind) {
    setState({ busy: true, msg: "Waiting for MetaMask…", error: "", cert: null });
    try {
      const c = wallet.contract;
      const n = BigInt(amount);
      const receipt = await sendTx(
        () => kind === "buy" ? c.buy(p.id, n, { value: n * BigInt(deployment.pricePerCreditWei) }) : c.retire(p.id, n, who.trim()),
        (st) => setState((s) => ({ ...s, msg: st === "sending" ? "Sending…" : "Confirmed" })),
      );
      let cert = null;
      if (kind === "retire") {
        const ev = receipt.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "CreditsRetired");
        cert = { id: Number(ev.args.retirementId), amount: Number(ev.args.amount), who: ev.args.beneficiary, tx: receipt.hash };
      }
      setState({ busy: false, msg: kind === "buy" ? `Bought ${amount} credits.` : "", error: "", cert });
      onChanged();
    } catch (e) {
      setState({ busy: false, msg: "", error: explainError(e).text, cert: null });
    }
  }

  return (
    <article className="panel p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">GP-{p.id} {meta.name && <span className="font-body font-normal muted text-lg">{meta.name}</span>}</h2>
          <p className="text-sm muted">Owner {short(p.owner)}{isOwner && " (you)"}, {p.cellCount} map cells</p>
        </div>
        <ForestBadge frozen={p.frozen} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><div className="text-sm muted">Last check</div><VerdictBadge verdict={p.verdict} small /></div>
        <div><div className="text-sm muted">Created</div><div className="font-bold mono">{p.issued} of {p.maxCredits}</div></div>
        <div><div className="text-sm muted">Retired</div><div className="font-bold mono">{p.retired}</div></div>
        <div><div className="text-sm muted">You hold</div><div className="font-bold mono">{wallet ? p.mine : "–"}</div></div>
      </div>

      {wallet && !p.frozen && (
        <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-line">
          <div className="space-y-2">
            <label className="block text-sm font-bold" htmlFor={`amt-${p.id}`}>Number of credits</label>
            <input id={`amt-${p.id}`} className="field" type="number" min="1" value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} />
            {!isOwner && (
              <button className="btn-main w-full" disabled={state.busy || p.forSale < 1} onClick={() => act("buy")}>
                Buy for {(Number(priceText().split(" ")[0]) * amount).toFixed(3)} POL
              </button>
            )}
            {!isOwner && <p className="text-sm muted">{p.forSale} for sale at {priceText()} each (test coins).</p>}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold" htmlFor={`who-${p.id}`}>Who is this retirement for?</label>
            <input id={`who-${p.id}`} className="field" placeholder="A name or company" value={who} onChange={(e) => setWho(e.target.value)} />
            <button className="btn-quiet w-full" disabled={state.busy || p.mine < 1 || !who.trim()} onClick={() => act("retire")}>Retire {amount} credits</button>
          </div>
        </div>
      )}
      {p.frozen && <p className="text-ember">Satellites found {p.lastLossBps / 100}% forest loss, so these credits can no longer be sold, moved or retired. Credits retired earlier stay retired.</p>}
      {state.busy && <p className="muted">{state.msg}</p>}
      {!state.busy && state.msg && <p className="text-leaf font-bold">{state.msg}</p>}
      {state.error && <p role="alert" className="text-ember font-bold">{state.error}</p>}
      {state.cert && (
        <div className="rounded-2xl border-2 border-leaf bg-white p-5">
          <p className="font-display text-2xl font-extrabold">Retirement certificate R-{state.cert.id}</p>
          <p className="mt-1">{state.cert.amount} tonnes of CO₂ from forest GP-{p.id} retired for <b>{state.cert.who}</b>. These credits are burned and can never be used again.</p>
          <div className="flex flex-wrap gap-3 mt-3">
            <Link className="btn-quiet" to={`/lookup?q=R-${state.cert.id}`}>Open certificate</Link>
            <a className="btn-quiet" href={txUrl(state.cert.tx)} target="_blank" rel="noreferrer">Blockchain proof</a>
          </div>
        </div>
      )}
      <Link className="text-leaf underline" to={`/lookup?q=GP-${p.id}`}>Full history of GP-{p.id}</Link>
    </article>
  );
}

export default function Credits() {
  const [wallet, setWallet] = useState(null);
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await listProjects();
      const c = reader();
      const withBalances = await Promise.all(list.map(async (p) => ({
        ...p,
        forSale: Number(await c.balanceOf(p.owner, p.id)),
        mine: wallet ? Number(await c.balanceOf(wallet.address, p.id)) : 0,
      })));
      setProjects(withBalances.reverse());
    } catch (e) {
      setError(explainError(e).text);
    }
  }, [wallet]);

  useEffect(() => { if (hasChain()) load(); }, [load]);

  async function connect() {
    try { setWallet(await connectWallet()); setError(""); } catch (e) { setError(e.message); }
  }

  if (!hasChain()) return <p className="panel p-5">The smart contract is not deployed yet. Deploy it first (see the README).</p>;

  const mineFirst = projects && wallet
    ? [...projects].sort((a, b) => (b.mine > 0 || b.owner.toLowerCase() === wallet.address.toLowerCase()) - (a.mine > 0 || a.owner.toLowerCase() === wallet.address.toLowerCase()))
    : projects;

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold">My credits</h1>
          <p className="muted mt-1">Buy credits from checked forests, or retire them for a climate claim.</p>
        </div>
        {wallet
          ? <span className="panel px-4 py-2 font-bold">Wallet {short(wallet.address)}</span>
          : <button className="btn-main" onClick={connect}>Connect wallet</button>}
      </header>
      {error && <p role="alert" className="text-ember font-bold">{error}</p>}
      {!projects && !error && <p className="muted">Reading the blockchain…</p>}
      {projects?.length === 0 && (
        <div className="panel p-6">
          <p className="font-bold">No forests registered yet.</p>
          <Link to="/check" className="btn-main mt-3">Check a forest</Link>
        </div>
      )}
      {mineFirst?.map((p) => <ProjectCard key={p.id} p={p} wallet={wallet} onChanged={load} />)}
    </div>
  );
}
