// A short list of blockchain steps with a friendly status for each.
import { txUrl } from "../lib/chain";

const STATUS = {
  todo: { text: "", dot: "bg-line" },
  wallet: { text: "Waiting for MetaMask…", dot: "bg-canopy working" },
  sending: { text: "Sending…", dot: "bg-canopy working" },
  working: { text: "Working…", dot: "bg-canopy working" },
  confirmed: { text: "Done", dot: "bg-leaf" },
  failed: { text: "Refused", dot: "bg-ember" },
};

export default function TxSteps({ steps }) {
  return (
    <ol className="space-y-3">
      {steps.map((s) => {
        const st = STATUS[s.status] || STATUS.todo;
        return (
          <li key={s.label} className="flex items-start gap-3">
            <span className={`hex w-5 h-5 mt-0.5 shrink-0 ${st.dot}`} />
            <div className="flex-1">
              <div className="font-bold">{s.label}</div>
              {s.status !== "todo" && <div className="text-sm muted">{s.note || st.text}</div>}
              {s.tx && <a className="text-sm underline text-leaf" href={txUrl(s.tx)} target="_blank" rel="noreferrer">See it on the blockchain</a>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
