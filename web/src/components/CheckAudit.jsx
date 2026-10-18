// Audit trail of one check: every rule, its limit, the measured value, and whether it passed.
// The first rule that fails decides the verdict; rules after it are not needed.
import { Orb } from "./Verdict";

const DEFAULT_RULES = {
  min_clear_pct: 70, min_forest_cover_pct: 30, min_forest_ha: 1,
  not_eligible_loss_pct: 5, review_loss_pct: 2, max_low_confidence_pct: 20,
};

function rows(n, v) {
  return [
    { rule: "Land is not already claimed", limit: "no overlapping map cells", value: "free", pass: true, fails: "Already claimed" },
    { rule: "Enough of the land seen clearly", limit: `at least ${v.min_clear_pct}% cloud-free`, value: `${n.clear_pct}%`,
      pass: n.clear_pct >= v.min_clear_pct, fails: "Can't check yet" },
    { rule: "The land is mostly forest", limit: `at least ${v.min_forest_cover_pct}% forest`, value: `${n.forest_cover_after_pct}%`,
      pass: n.forest_cover_after_pct >= v.min_forest_cover_pct && n.forest_before_ha >= v.min_forest_ha, fails: "Not eligible" },
    { rule: "No major tree loss", limit: `under ${v.not_eligible_loss_pct}%`, value: `${n.loss_pct}%`,
      pass: n.loss_pct < v.not_eligible_loss_pct, fails: "Not eligible" },
    { rule: "Tree loss clearly near zero", limit: `under ${v.review_loss_pct}%`, value: `${n.loss_pct}%`,
      pass: n.loss_pct < v.review_loss_pct, fails: "Needs review" },
    { rule: "Forest map is sure", limit: `unsure pixels at most ${v.max_low_confidence_pct}%`, value: `${n.low_confidence_pct}%`,
      pass: n.low_confidence_pct <= v.max_low_confidence_pct, fails: "Needs review" },
  ];
}

function Mark({ state }) {
  if (state === "pass") return <Orb className="w-6 h-6 bg-leaf text-white text-xs">✓</Orb>;
  if (state === "fail") return <Orb className="w-6 h-6 bg-ember text-white text-xs">✕</Orb>;
  return <Orb className="w-6 h-6 bg-line text-moss text-xs">·</Orb>;
}

export default function CheckAudit({ payload }) {
  const r = payload.result;
  if (r.verdict === "AlreadyClaimed") return null;
  const v = { ...DEFAULT_RULES, ...(payload.rules || {}) };
  const list = rows(r.numbers, v);
  const decider = list.findIndex((x) => !x.pass);
  const ex = payload.explanation;

  return (
    <section className="panel p-5">
      <h2 className="text-xl font-bold">Audit trail of this check</h2>
      <p className="muted text-sm mt-1">The rules run in this order. The first one that fails decides the answer, and weak evidence can never become Verified.</p>
      <ol id="proof-rules" className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
        {list.map((x, i) => {
          const state = decider === -1 || i < decider ? "pass" : i === decider ? "fail" : "skip";
          return (
            <li key={x.rule} className={`choice flex items-start gap-3 p-3 hover:bg-[#F1F7F3] ${state === "skip" ? "opacity-50" : ""}`}>
              <Mark state={state} />
              <div className="flex-1">
                <div className="font-bold">{x.rule}</div>
                <div className="text-sm muted">Limit: {x.limit}</div>
                {state === "fail" && <div className="text-sm font-bold text-ember">This rule decided the answer: {x.fails}</div>}
                {state === "skip" && <div className="text-sm muted">Not needed: an earlier rule already decided</div>}
              </div>
              <div className="font-display font-bold mono">{x.value}</div>
            </li>
          );
        })}
      </ol>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex gap-2"><Mark state="pass" /><span><b>Credits worked out by code.</b> AI was not used for any number.</span></li>
        {ex?.note && (
          <li className="flex gap-2"><Mark state={ex.source === "ai" ? "pass" : "skip"} /><span><b>Explanation:</b> {ex.note}</span></li>
        )}
        <li className="flex gap-2"><Mark state="pass" /><span><b>Check details saved</b>, so this exact check can be run again.</span></li>
      </ul>
    </section>
  );
}
