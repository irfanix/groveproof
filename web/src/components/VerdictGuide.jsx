// "What the answers mean": the five possible verdicts, each with icon, name and what happens next.
import { VERDICTS, VerdictBadge } from "./Verdict";

const ORDER = ["Verified", "NeedsReview", "NotEligible", "AlreadyClaimed", "CantCheckYet"];

export default function VerdictGuide() {
  return (
    <details className="panel p-5 group">
      <summary className="cursor-pointer font-display font-bold text-lg list-none flex items-center justify-between">
        What the answers mean <span className="muted group-open:rotate-90 transition-transform">›</span>
      </summary>
      <ul className="mt-4 space-y-3">
        {ORDER.map((k) => (
          <li key={k}>
            <VerdictBadge verdict={k} small round />
            <p className="text-sm mt-1 pl-8">{VERDICTS[k].meaning} {VERDICTS[k].next}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
