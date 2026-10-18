// Screen: Dashboard. One page, four views: company, project owner, verifier, public visitor.
// The first visit asks "Who are you?"; the choice is remembered and can be changed any time.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Calculator from "../components/Calculator";
import ClimateMap, { statusOf } from "../components/ClimateMap";
import EvidencePanel from "../components/EvidencePanel";
import { Icon, IconTile } from "../components/Icon";
import { Kpi, Lifecycle, Qr, Section, StackedBars, StateIcon, dateOnly } from "../components/ui";
import { VERDICTS } from "../components/Verdict";
import { getCheck, getReviewQueue } from "../lib/api";
import { connectWallet, hasChain, priceText, short, txUrl } from "../lib/chain";
import { recentChecks, timeAgo } from "../lib/history";
import { ROLES, usePrefs } from "../lib/prefs";
import { alertsFor, holdingsOf, loadRegistry, projectsOwnedBy, retirementsBy } from "../lib/registry";

const YEAR = 365 * 86400;

function RolePicker({ onPick }) {
  const { t } = usePrefs();
  return (
    <section className="max-w-4xl mx-auto text-center space-y-6 py-6">
      <h1 className="text-4xl sm:text-5xl font-extrabold">{t("role.pick")}</h1>
      <p className="text-lg muted">{t("role.pick.d")}</p>
      <div className="grid sm:grid-cols-2 gap-4 text-left">
        {Object.entries(ROLES).map(([k, r]) => (
          <button key={k} onClick={() => onPick(k)} className="choice panel p-6 flex gap-4 items-start">
            <IconTile name={r.icon} size="xl" />
            <span><span className="block text-xl font-bold">{t(r.key)}</span><span className="block muted mt-1">{t(`${r.key}.d`)}</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function WalletBar({ why }) {
  const { prefs, update, t } = usePrefs();
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  async function connect() {
    setError("");
    try { const w = await connectWallet(); update({ wallet: w.address }); } catch (e) { setError(e.message); }
  }
  if (prefs.wallet) {
    return (
      <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm"><span className="muted">Showing wallet</span> <b className="mono">{short(prefs.wallet)}</b></div>
        <button className="btn-quiet text-sm" onClick={() => update({ wallet: null })}>Change wallet</button>
      </div>
    );
  }
  return (
    <div className="panel p-5 space-y-3">
      <div className="font-bold">{why}</div>
      <div className="flex flex-wrap gap-3 items-center">
        <button className="btn-main" onClick={connect}>{t("common.connect")}</button>
        <span className="muted text-sm">or look at any wallet, read-only:</span>
        <form className="flex gap-2 flex-1 min-w-[260px]" onSubmit={(e) => { e.preventDefault(); if (/^0x[0-9a-fA-F]{40}$/.test(paste.trim())) update({ wallet: paste.trim() }); else setError("That does not look like a wallet address (0x followed by 40 characters)."); }}>
          <input className="field" placeholder="0x…" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="btn-quiet">{"View"}</button>
        </form>
      </div>
      {error && <p className="text-sm text-ember">{error}</p>}
    </div>
  );
}

function Alerts({ reg }) {
  const { prefs } = usePrefs();
  const list = alertsFor(reg, { role: prefs.role, address: prefs.wallet, prefs });
  if (!list.length) return null;
  return (
    <Section title="Smart alerts" sub="Things that need attention, based on your role and alert settings.">
      <ul className="space-y-2">
        {list.map((a, i) => (
          <li key={i}><Link to={`/lookup?q=GP-${a.project}`} className="choice flex gap-3 items-start rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${a.level === "high" ? "bg-ember" : "bg-amberleaf"}`} />{a.text}
          </Link></li>
        ))}
      </ul>
    </Section>
  );
}

function ProjectRow({ p }) {
  const v = VERDICTS[p.verdict] || VERDICTS.None;
  return (
    <Link to={`/lookup?q=GP-${p.id}`} className="choice grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-xl border border-line bg-white px-3 py-2.5">
      {p.frozen ? <IconTile name="lock" size="sm" tone="red" /> : <span className={`orb w-8 h-8 inline-flex items-center justify-center text-white font-bold ${v.bg}`}>{v.icon}</span>}
      <span className="min-w-0"><span className="font-bold">GP-{p.id}</span> <span className="muted truncate">{p.name}</span>
        <span className="block text-xs muted">{p.frozen ? "Frozen" : v.label} · {p.stageName} · {p.cellCount} map cells</span></span>
      <span className="text-right text-sm"><span className="block font-bold mono">{p.issued}</span><span className="text-xs muted">credits</span></span>
    </Link>
  );
}

function CreditsChart({ projects }) {
  const rows = projects.map((p) => {
    const owner = p.holders.find((h) => h.isOwner)?.amount || 0;
    const others = p.holders.filter((h) => !h.isOwner).reduce((s, h) => s + h.amount, 0);
    return { label: `GP-${p.id} ${p.name}${p.frozen ? " (frozen)" : ""}`, retired: p.retired, buyers: others, owner, pending: p.pendingCredits };
  });
  return (
    <StackedBars rows={rows} series={[
      { key: "retired", label: "Retired", color: "#173A2B" },
      { key: "buyers", label: "Held by buyers", color: "#2F7D4F" },
      { key: "owner", label: "Held by owner", color: "#7FC29B" },
      { key: "pending", label: "Verified, not created yet", color: "#D8E3DC" },
    ]} />
  );
}

function MarketNote({ reg }) {
  const sales = reg.projects.flatMap((p) => p.sales.map((s) => ({ ...s, p })));
  return (
    <Section title="Market data" sub="Which numbers are real and which are not.">
      <div className="rounded-xl bg-amberleaf/10 text-[#7A4A0E] p-3 text-sm">
        <b>No market prices shown.</b> There is no reliable free price feed for forest credits like these, so we do not draw a price chart. The demo contract sells at a fixed price of <b>{priceText()}</b> per credit, paid in free test coins with no real value.
      </div>
      <div className="mt-4 text-sm font-bold">Real sales on the test network ({sales.length})</div>
      <ul className="mt-2 divide-y divide-line text-sm">
        {sales.length === 0 && <li className="muted py-2">No sales yet.</li>}
        {sales.map((s) => (
          <li key={s.tx} className="py-2 flex justify-between gap-3">
            <span>{s.amount} credits of GP-{s.p.id} to {short(s.buyer)}</span>
            <a className="underline muted" href={txUrl(s.tx)} target="_blank" rel="noreferrer">{dateOnly(s.time)}</a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ------------------------------------------------------------------ views

function PublicView({ reg }) {
  const { t } = usePrefs();
  const T = reg.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label={t("kpi.projects")} value={T.projects} sub={`${T.verified} verified by satellites`} />
        <Kpi label={t("kpi.issued")} value={T.issued} sub="1 credit = 1 tonne CO₂" />
        <Kpi label={t("kpi.retired")} value={T.retired} sub="used for climate claims, burned" />
        <Kpi label={t("kpi.pending")} value={T.pending} sub="allowed by satellites" />
        <Kpi label={t("kpi.frozen")} value={T.frozen} tone={T.frozen ? "text-ember" : ""} sub="forest loss found" />
      </div>
      <Section title="Interactive climate map" sub="Every project, drawn from its map cells on the blockchain.">
        <ClimateMap projects={reg.projects} />
      </Section>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Section title="Where every credit is" sub="Retired, held, or allowed but not created yet, per project."><CreditsChart projects={reg.projects} /></Section>
        <Section title="All projects" sub="Press one to open its credit passport.">
          <div className="space-y-2">{reg.projects.map((p) => <ProjectRow key={p.id} p={p} />)}</div>
        </Section>
      </div>
      <MarketNote reg={reg} />
    </div>
  );
}

function CompanyView({ reg }) {
  const { prefs } = usePrefs();
  const holdings = holdingsOf(reg, prefs.wallet);
  const certs = retirementsBy(reg, prefs.wallet);
  const held = holdings.reduce((s, h) => s + h.amount, 0);
  const frozenHeld = holdings.filter((h) => h.project.frozen).reduce((s, h) => s + h.amount, 0);
  const retired = certs.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="space-y-6">
      <WalletBar why="Connect your company wallet to see your credits and certificates." />
      {prefs.wallet && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Credits you hold" value={held} sub="ready to retire" />
          <Kpi label="Tonnes you retired" value={retired} sub={`${certs.length} certificate${certs.length === 1 ? "" : "s"}`} />
          <Kpi label="Frozen in your wallet" value={frozenHeld} tone={frozenHeld ? "text-ember" : ""} sub="forest loss found" />
          <Kpi label="Projects you support" value={new Set([...holdings.map((h) => h.project.id), ...certs.map((c) => c.project.id)]).size} />
        </div>
      )}
      <Alerts reg={reg} />
      {prefs.wallet && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Section title="Your credits" sub="With the result of each project's trust checks.">
            {holdings.length === 0 && <p className="text-sm muted">This wallet holds no credits. <Link to="/credits" className="underline">Visit the marketplace</Link>.</p>}
            <div className="space-y-2">
              {holdings.map(({ project: p, amount }) => {
                const ok = p.verdict === "Verified" && !p.frozen;
                return (
                  <Link key={p.id} to={`/lookup?q=GP-${p.id}`} className="choice flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                    <span><b>{amount}</b> × GP-{p.id} <span className="muted">{p.name}</span>
                      <span className="block text-xs muted">Satellites: {VERDICTS[p.verdict]?.label}{p.frozen ? " · frozen after forest loss" : " · forest healthy"} · open for all trust checks</span></span>
                    <StateIcon state={ok ? "pass" : "fail"} />
                  </Link>
                );
              })}
            </div>
          </Section>
          <Section title="Your retirement certificates" sub="Scan a QR code to check it.">
            {certs.length === 0 && <p className="text-sm muted">No retirements yet. Retire credits in the marketplace to get a certificate.</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {certs.map((c) => (
                <Link key={c.id} to={`/lookup?q=R-${c.id}`} className="choice rounded-2xl border border-line bg-white p-3 flex gap-3 items-center">
                  <Qr text={`${window.location.origin}/lookup?q=R-${c.id}`} size={72} />
                  <span className="text-sm"><b className="block text-lg">R-{c.id}</b>{c.amount} t CO₂ for “{c.beneficiary}”<span className="block text-xs muted">{dateOnly(c.time)}</span></span>
                </Link>
              ))}
            </div>
          </Section>
        </div>
      )}
      <Section title="Emissions calculator" sub="Estimate your yearly emissions and how many credits would balance them."><Calculator /></Section>
    </div>
  );
}

function nextStep(p) {
  const now = Date.now() / 1000;
  if (p.frozen) return "Your credits are frozen because satellites found forest loss. Add photos and a report explaining what happened.";
  if (p.verdict === "None") return "Run a satellite check on the Check a forest page, then record the result.";
  if (p.verdict === "NeedsReview") return "Add photos, reports and monitoring data below. An independent reviewer will look at them.";
  if (p.verdict === "CantCheckYet") return "Clouds hid the land. Run a new check with other dates.";
  if (p.verdict === "NotEligible") return "This land cannot earn credits right now.";
  if (p.issued < p.maxCredits) return `Create your credits: up to ${p.maxCredits - p.issued} more are allowed by the satellites.`;
  if (p.lastCheckAt && now - p.lastCheckAt > YEAR * 0.9) return "A new satellite check is due soon to keep your credits living.";
  return "All done. Your credits are in the marketplace. Adding proof of community benefits will help buyers decide.";
}

function OwnerView({ reg }) {
  const { prefs } = usePrefs();
  const mine = projectsOwnedBy(reg, prefs.wallet);
  const [sel, setSel] = useState(null);
  const p = mine.find((x) => x.id === sel) || mine[0];
  const recent = recentChecks();
  return (
    <div className="space-y-6">
      <WalletBar why="Connect the wallet that registered your forest to see its progress." />
      <Alerts reg={reg} />
      {prefs.wallet && mine.length === 0 && (
        <Section title="No forest registered with this wallet yet">
          <p className="muted">Check your forest with satellites, then register it to create credits.</p>
          <Link to="/check" className="btn-main mt-3">Check a forest</Link>
        </Section>
      )}
      {mine.length > 1 && (
        <div className="flex flex-wrap gap-2">{mine.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`chip ${p?.id === x.id ? "chip-on" : ""}`}>GP-{x.id} {x.name}</button>)}</div>
      )}
      {p && (
        <>
          <Section title={`GP-${p.id} ${p.name}`} sub="Verification progress" right={<Link className="btn-quiet text-sm" to={`/lookup?q=GP-${p.id}`}>Open passport</Link>}>
            <Lifecycle project={p} />
            <div className="mt-5 rounded-2xl bg-leaf/10 p-4 flex gap-3 items-start">
              <IconTile name="arrow" size="md" tone="solid" />
              <div><div className="font-bold">Next step</div><div>{nextStep(p)}</div></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <Kpi label="Allowed by satellites" value={p.maxCredits} />
              <Kpi label="Created" value={p.issued} />
              <Kpi label="Sold" value={p.soldAmount} />
              <Kpi label="Retired by buyers" value={p.retired} />
            </div>
            <p className="text-xs muted mt-3">Last satellite check: {p.lastCheckAt ? dateOnly(p.lastCheckAt) : "none yet"}.</p>
          </Section>
          <EvidencePanel p={p} role="owner" key={p.id} />
        </>
      )}
      {recent.length > 0 && (
        <Section title="Your recent checks" sub="Saved in this browser.">
          <div className="grid sm:grid-cols-2 gap-2">
            {recent.map((r) => (
              <Link key={r.check_id} to={`/check?open=${r.check_id}`} className="choice rounded-xl border border-line bg-white px-3 py-2 text-sm">
                <b>{r.name}</b> <span className="muted">· {VERDICTS[r.verdict]?.label} · {timeAgo(r.at)}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function VerifierView({ reg }) {
  const [queue, setQueue] = useState(null);
  const [sel, setSel] = useState(null);
  const [check, setCheck] = useState(null);
  useEffect(() => { getReviewQueue().then((q) => setQueue(q.projects)).catch(() => setQueue([])); }, []);
  const items = useMemo(() => {
    if (!queue) return [];
    const byId = Object.fromEntries(queue.map((q) => [q.project_id, q]));
    return reg.projects.map((p) => {
      const q = byId[p.id];
      const why = [];
      let score = 0;
      if (p.verdict === "NeedsReview") { why.push("Satellites asked for a human review"); score += 3; }
      if (p.verdict === "None") { why.push("No satellite check recorded yet"); score += 1; }
      if (q?.high_flags) { why.push(`${q.high_flags} serious warning${q.high_flags > 1 ? "s" : ""} in the evidence`); score += 4; }
      if (q && q.files && !q.review) { why.push(`${q.files} file${q.files > 1 ? "s" : ""} waiting for review`); score += 2; }
      if (p.frozen) { why.push("Frozen after forest loss"); score += 1; }
      return { p, q, why, score };
    }).filter((x) => x.why.length).sort((a, b) => b.score - a.score);
  }, [queue, reg]);
  const current = items.find((x) => x.p.id === sel) || items[0];
  useEffect(() => {
    setCheck(null);
    if (current?.p.checkId) getCheck(current.p.checkId).then(setCheck).catch(() => {});
  }, [current?.p.id, current?.p.checkId]);

  if (queue === null) return <p className="muted">Loading the review queue…</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Waiting for you" value={items.length} />
        <Kpi label="Serious warnings" value={queue.reduce((s, q) => s + q.high_flags, 0)} tone="text-ember" />
        <Kpi label="Files to look at" value={queue.filter((q) => !q.review).reduce((s, q) => s + q.files, 0)} />
        <Kpi label="Reviews done" value={queue.filter((q) => q.review).length} />
      </div>
      {items.length === 0 ? <Section title="Nothing waiting">All evidence has been reviewed.</Section> : (
        <div className="grid lg:grid-cols-[0.8fr_1.6fr] gap-6 items-start">
          <Section title="Review queue" sub="Most urgent first.">
            <div className="space-y-2">
              {items.map((x) => (
                <button key={x.p.id} onClick={() => setSel(x.p.id)} className={`choice w-full text-left rounded-xl border px-3 py-2.5 ${current?.p.id === x.p.id ? "border-leaf bg-leaf/5" : "border-line bg-white"}`}>
                  <div className="font-bold">GP-{x.p.id} {x.p.name}</div>
                  <ul className="text-xs muted list-disc pl-4">{x.why.map((w) => <li key={w}>{w}</li>)}</ul>
                </button>
              ))}
            </div>
          </Section>
          {current && (
            <div className="space-y-6">
              <Section title={`Reviewing GP-${current.p.id}`} sub="What the satellites measured, next to the owner's evidence." right={<Link className="btn-quiet text-sm" to={`/lookup?q=GP-${current.p.id}`}>Open passport</Link>}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Kpi label="Satellite verdict" value={VERDICTS[current.p.verdict]?.label || "None"} />
                  <Kpi label="Forest now" value={check ? `${check.result.numbers.forest_after_ha} ha` : "–"} />
                  <Kpi label="Tree loss" value={check ? `${check.result.numbers.loss_pct}%` : "–"} />
                  <Kpi label="Seen clearly" value={check ? `${check.result.numbers.clear_pct}%` : "–"} />
                </div>
              </Section>
              <EvidencePanel p={current.p} role="verifier" key={current.p.id} />
            </div>
          )}
        </div>
      )}
      <p className="text-xs muted">Recording a satellite verdict on the blockchain is done by the official checker. Your review decides whether the owner's ground evidence and benefit claims are accepted.</p>
    </div>
  );
}

export default function Dashboard() {
  const { prefs, update, t } = usePrefs();
  const [reg, setReg] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { if (hasChain()) loadRegistry().then(setReg).catch((e) => setError(e.message)); }, []);

  if (!prefs.role) return <RolePicker onPick={(role) => update({ role })} />;
  const role = ROLES[prefs.role];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-5xl font-extrabold">{t("dash.hello")}</h1>
          <p className="muted mt-2 text-lg inline-flex items-center gap-2"><Icon name={role.icon} className="w-5 h-5" /> {t("dash.as", { role: t(role.key) })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ROLES).map(([k, r]) => (
            <button key={k} onClick={() => update({ role: k })} className={`chip ${prefs.role === k ? "chip-on" : ""}`}><Icon name={r.icon} className="w-4 h-4" /> {t(r.key)}</button>
          ))}
        </div>
      </header>
      {!hasChain() && <p className="panel p-5">The smart contract is not deployed yet. Deploy it first (see the README).</p>}
      {error && <p role="alert" className="text-ember">{error}</p>}
      {hasChain() && !reg && !error && <p className="muted">Reading the blockchain…</p>}
      {reg && prefs.role === "public" && <PublicView reg={reg} />}
      {reg && prefs.role === "company" && <CompanyView reg={reg} />}
      {reg && prefs.role === "owner" && <OwnerView reg={reg} />}
      {reg && prefs.role === "verifier" && <VerifierView reg={reg} />}
    </div>
  );
}

export { statusOf };
