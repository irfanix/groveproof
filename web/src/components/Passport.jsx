// The credit passport: four plain answers, trust checks, impact scorecard and the chained audit trail.
import { ZeroAddress } from "ethers";
import { Link } from "react-router-dom";
import { VERDICT_NAMES, short, txUrl, addressUrl } from "../lib/chain";
import { usePrefs } from "../lib/prefs";
import { StateIcon, STATE, date, dateOnly } from "./ui";
import { VERDICTS } from "./Verdict";
import { Icon, IconTile } from "./Icon";

// ------------------------------------------------------------------ four answers
export function FourAnswers({ p, trust, evidence, check, you }) {
  const { t } = usePrefs();
  const n = check?.result?.numbers;
  const v = VERDICTS[p.verdict] || VERDICTS.None;
  const genuine = trust.failed ? "fail" : p.verdict === "Verified" ? "pass" : "unknown";
  const owners = p.holders.slice(0, 3);
  const isYou = (a) => you && a.toLowerCase() === you.toLowerCase();
  const plainTransfers = p.transferred - p.soldAmount;

  const cards = [
    {
      q: t("q.genuine"), state: genuine,
      a: genuine === "pass" ? "Yes, the key checks passed." : genuine === "fail" ? "Warnings were found." : "Not proven yet.",
      body: <>{trust.passed} checks passed, {trust.failed} failed and {trust.unknown} are still unknown. <a href="#trust" className="underline">See every check</a></>,
    },
    {
      q: t("q.owner"), state: p.holders.length ? "pass" : "unknown",
      a: p.holders.length ? `${p.holders.length} wallet${p.holders.length > 1 ? "s" : ""} hold these credits.` : "Nobody yet: no credits created.",
      body: (
        <ul className="space-y-1">
          {owners.map((h) => (
            <li key={h.address} className="flex justify-between gap-2">
              <a className="mono underline" href={addressUrl(h.address)} target="_blank" rel="noreferrer">{short(h.address)}</a>
              <span><b>{h.amount}</b> {h.isOwner ? "(project owner)" : isYou(h.address) ? "(you)" : ""}</span>
            </li>
          ))}
          {p.retired > 0 && <li className="muted">{p.retired} retired credits belong to nobody: they were burned.</li>}
        </ul>
      ),
    },
    {
      q: t("q.used"), state: p.retired || p.transferred ? "pass" : "unknown",
      a: p.retired ? `Yes: ${p.retired} retired${p.soldAmount ? `, ${p.soldAmount} sold` : ""}.` : p.soldAmount ? `${p.soldAmount} sold, none retired yet.` : "Not sold or used yet.",
      body: (
        <>
          {p.soldAmount > 0 && <div>{p.soldAmount} sold in {p.sales.length} sale{p.sales.length > 1 ? "s" : ""}.</div>}
          {plainTransfers > 0 && <div>{plainTransfers} moved between wallets.</div>}
          {p.retirements.map((r) => (
            <div key={r.id}>{r.amount} retired for “{r.beneficiary}”, <Link className="underline" to={`/lookup?q=R-${r.id}`}>certificate R-{r.id}</Link></div>
          ))}
          <div className="muted mt-1">A retired credit is burned, so it can never be sold or retired again.</div>
        </>
      ),
    },
    {
      q: t("q.evidence"), state: p.verdict === "Verified" && !p.frozen ? "pass" : p.verdict === "NotEligible" || p.frozen ? "fail" : "unknown",
      a: `Satellites: ${v.label}.`,
      body: (
        <>
          {n ? <div>{n.forest_after_ha} ha of forest seen, {n.loss_pct}% tree loss, {n.clear_pct}% seen clearly.</div> : <div className="muted">Satellite numbers are not stored on this checker.</div>}
          <div>Owner evidence: {evidence ? `${evidence.items.length} file${evidence.items.length === 1 ? "" : "s"}, ${evidence.review ? DECISION_TEXT[evidence.review.decision] : "not reviewed yet"}` : "loading…"}.</div>
        </>
      ),
    },
  ];
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {cards.map((c) => (
        <article key={c.q} className="panel p-5">
          <div className="flex items-start gap-3">
            <StateIcon state={c.state} size="w-9 h-9 text-base" />
            <div>
              <h3 className="font-bold muted text-sm">{c.q}</h3>
              <p className="text-lg font-bold leading-snug">{c.a}</p>
            </div>
          </div>
          <div className="mt-3 text-sm space-y-1">{c.body}</div>
        </article>
      ))}
    </div>
  );
}

export const DECISION_TEXT = { approved: "approved by a reviewer", more_needed: "reviewer asked for more", rejected: "rejected by a reviewer" };

// ------------------------------------------------------------------ trust checks
export function TrustList({ trust }) {
  const { t } = usePrefs();
  return (
    <section id="trust" className="panel p-5 scroll-mt-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t("trust.title")}</h2>
        <div className="flex gap-2 text-sm font-bold">
          <span className="rounded-full px-3 py-1 bg-leaf/10 text-leaf">{trust.passed} {t("trust.pass")}</span>
          <span className="rounded-full px-3 py-1 bg-ember/10 text-ember">{trust.failed} {t("trust.fail")}</span>
          <span className="rounded-full px-3 py-1 bg-mist/10 text-mist">{trust.unknown} {t("trust.unknown")}</span>
        </div>
      </div>
      <p className="text-sm muted mt-1">We do not add these up into one score. Each check is listed with the reason it passed, failed or is still open.</p>
      <ul className="mt-4 divide-y divide-line">
        {trust.items.map((x) => (
          <li key={x.key} className="flex gap-3 py-3 choice px-2 -mx-2">
            <StateIcon state={x.state} />
            <div>
              <div className="font-bold">{x.title} <span className={`text-xs font-bold ml-1 ${STATE[x.state].text}`}>{t(`trust.${x.state}`)}</span></div>
              <div className="text-sm muted">{x.why}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ impact scorecard
export function Impact({ p, check, evidence }) {
  const { t } = usePrefs();
  const n = check?.result?.numbers;
  const c = check?.result?.credits;
  const claims = evidence?.claims || [];
  const cats = evidence?.claim_categories || {};
  const Col = ({ title, icon, tone, note, children }) => (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="font-bold flex items-center gap-2">{icon && <IconTile name={icon} size="sm" />}{title}</div>
      <div className="text-xs muted mb-3">{note}</div>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  );
  const Row = ({ k, v }) => <div className="flex justify-between gap-3"><dt className="muted">{k}</dt><dd className="font-bold mono text-right">{v}</dd></div>;
  return (
    <section className="panel p-5">
      <h2 className="text-xl font-bold">{t("impact.title")}</h2>
      <p className="text-sm muted mt-0.5">What the satellites measured, what we estimated from those measurements, and what the owner says. They are kept in separate columns.</p>
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <Col icon="satellite" title={t("impact.measured")} tone="border-leaf/40 bg-leaf/5" note="By satellites, from pixels">
          {n ? <>
            <Row k="Forest now" v={`${n.forest_after_ha} ha`} />
            <Row k="Tree loss" v={`${n.loss_pct}%`} />
            <Row k="Seen clearly" v={`${n.clear_pct}%`} />
          </> : <div className="muted">No satellite numbers on this checker yet.</div>}
          <Row k="Map cells claimed" v={p.cellCount} />
        </Col>
        <Col icon="calc" title={t("impact.estimated")} tone="border-amberleaf/40 bg-amberleaf/5" note="From IPCC default factors (demo method)">
          {c?.annual_co2_t != null ? <>
            <Row k="CO₂ stored per year" v={`${c.annual_co2_t} t`} />
            <Row k="Held back for uncertainty" v={`${Math.round(c.uncertainty_deduction * 100)}%`} />
            <Row k="Safety buffer" v={`${Math.round(c.buffer_share * 100)}%`} />
            <Row k="Credits allowed" v={c.credits} />
          </> : <><Row k="Credits allowed" v={p.maxCredits} /><div className="muted text-xs">Detailed estimate not stored on this checker.</div></>}
        </Col>
        <Col icon="note" title={t("impact.claimed")} tone="border-line bg-white" note="By the project owner. Shown as claims until a reviewer supports them.">
          {claims.length === 0 && <div className="muted">No community, jobs or biodiversity claims yet.</div>}
          {claims.map((x) => (
            <div key={x.id}>
              <div className="flex justify-between gap-2">
                <span className="muted">{cats[x.category] || x.category}</span>
                <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${x.status === "supported" ? "bg-leaf/10 text-leaf" : "bg-amberleaf/10 text-amberleaf"}`}>{x.status === "supported" ? "Supported" : "Not verified"}</span>
              </div>
              <div className="font-bold">{x.value != null && x.value !== "" ? `${x.value} ${x.unit} · ` : ""}{x.text}</div>
            </div>
          ))}
          <div className="text-xs muted pt-1">Renewable energy: not applicable to forest projects.</div>
        </Col>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ chained audit trail
function describe(e, p) {
  const a = e.args;
  switch (e.name) {
    case "ProjectRegistered": return ["Forest registered", `${a.cells.length} map cell${a.cells.length === 1 ? "" : "s"} claimed by ${short(a.owner)}`, "map"];
    case "VerificationRecorded": return ["Checked by satellites", `Verdict ${VERDICTS[VERDICT_NAMES[Number(a.verdict)]]?.label}, up to ${a.maxCredits} credits`, "satellite"];
    case "CreditsIssued": return ["Credits created", `${a.amount} credits for ${short(a.owner)}`, "sprout"];
    case "CreditsBought": return ["Credits sold", `${a.amount} credits from ${short(a.seller)} to ${short(a.buyer)}`, "handshake"];
    case "CreditsRetired": return ["Credits retired", `${a.amount} credits for “${a.beneficiary}” (certificate R-${a.retirementId})`, "flame"];
    case "Rechecked": return ["Checked again", `Tree loss ${Number(a.lossBps) / 100}%`, "refresh"];
    case "ProjectFrozen": return ["Frozen", "Major forest loss found, remaining credits frozen", "lock"];
    case "TransferSingle": return ["Credits moved", `${a.value} credits from ${short(a.from)} to ${short(a.to)}`, "arrow"];
    default: return [e.name, "", "leaf"];
  }
}

export function ChainTrail({ p }) {
  const { expert } = usePrefs();
  const saleTx = new Set(p.events.filter((e) => e.name === "CreditsBought").map((e) => e.tx));
  const shown = p.events.filter((e) => e.name !== "TransferSingle" ||
    (e.args.from !== ZeroAddress && e.args.to !== ZeroAddress && !saleTx.has(e.tx)));
  return (
    <section className="panel p-5">
      <h2 className="text-xl font-bold">Audit trail on the blockchain</h2>
      <p className="text-sm muted mt-0.5">Every event below is a blockchain transaction, in the order it happened. Old entries cannot be edited later.</p>
      <ol className="mt-4 relative">
        <span className="absolute left-[21px] top-3 bottom-3 w-0.5 bg-line" aria-hidden />
        {shown.map((e, i) => {
          const [title, detail, icon] = describe(e, p);
          const prev = shown[i - 1];
          const bad = e.name === "ProjectFrozen";
          return (
            <li key={`${e.tx}-${e.index}`} id={`ev-${i + 1}`} className="choice relative pl-14 pb-5 last:pb-0 scroll-mt-28">
              <span className="absolute left-0 top-0"><IconTile name={icon} size="md" tone={bad ? "red" : "green"} /></span>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-bold muted mono">#{i + 1}</span>
                <span className="font-bold">{title}</span>
                <span className="text-sm muted">{date(e.time)}</span>
              </div>
              <div>{detail}</div>
              <div className="text-xs muted mt-0.5 flex flex-wrap gap-x-3">
                <a className="underline mono" href={txUrl(e.tx)} target="_blank" rel="noreferrer">tx {expert ? e.tx : short(e.tx)}</a>
                {expert && <span className="mono">block {e.block}</span>}
                {prev ? <a className="underline" href={`#ev-${i}`}>follows #{i} ({short(prev.tx)})</a> : <span>first event</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs rounded-xl bg-amberleaf/10 text-[#7A4A0E] p-3">
        <b>Please note:</b> the blockchain protects these records from being changed. It cannot prove that a photo, a sensor reading or a claim is true. That is why satellites, automatic warnings and a human reviewer check the evidence first.
      </p>
    </section>
  );
}

export { dateOnly };
