// "Try to cheat": five attacks. Each asks the real contract (a read-only simulation of the
// transaction, with the same rules) and shows its refusal. Real refused transactions for all
// five attacks are in the contract test suite.
import { useState } from "react";
import { getAddress, hexlify, randomBytes } from "ethers";
import { deployment, explainError, listProjects, reader } from "../lib/chain";

const stranger = () => getAddress(hexlify(randomBytes(20)));
const ZERO32 = "0x" + "00".repeat(32);

export default function CheatPanel({ project, history }) {
  const [results, setResults] = useState({});

  const registered = history?.find((e) => e.name === "ProjectRegistered");
  const retirement = history?.find((e) => e.name === "CreditsRetired");

  const attacks = [
    {
      id: "retire-twice",
      title: "Retire the same credits twice",
      run: async (c) => {
        if (retirement) {
          const by = retirement.args.by;
          const left = await c.balanceOf(by, project.id);
          return c.retire.staticCall(project.id, left + retirement.args.amount, "Second claim", { from: by });
        }
        const left = await c.balanceOf(project.owner, project.id);
        return c.retire.staticCall(project.id, left + 1n, "Second claim", { from: project.owner });
      },
    },
    {
      id: "overcredit",
      title: "Create more credits than the satellites allow",
      run: (c) => c.issueCredits.staticCall(project.id, BigInt(Math.max(project.maxCredits - project.issued, 0) + 1), { from: project.owner }),
    },
    {
      id: "claimed-land",
      title: "Register land that is already claimed",
      run: (c) => c.registerProject.staticCall([...registered.args.cells], "copy", { from: stranger() }),
      disabled: !registered,
    },
    {
      id: "buy-frozen",
      title: "Buy credits from a frozen forest",
      run: async (c) => {
        const frozen = project.frozen ? project : (await listProjects()).find((p) => p.frozen);
        if (!frozen) throw Object.assign(new Error("No frozen forest yet. Ask for a new satellite check that finds loss to see this one."), { plain: true });
        return c.buy.staticCall(frozen.id, 1n, { value: BigInt(deployment.pricePerCreditWei), from: deployment.verifier });
      },
    },
    {
      id: "fake-verifier",
      title: "Record a verification without being the verifier",
      run: (c) => c.recordVerification.staticCall(project.id, 1, 1_000_000n, ZERO32, ZERO32, { from: stranger() }),
    },
  ];

  async function attack(a) {
    setResults((r) => ({ ...r, [a.id]: { busy: true } }));
    try {
      await a.run(reader());
      setResults((r) => ({ ...r, [a.id]: { ok: false, text: "The contract did not refuse this. Please report it." } }));
    } catch (e) {
      const text = e.plain ? e.message : explainError(e).text;
      setResults((r) => ({ ...r, [a.id]: { ok: !e.plain, plain: e.plain, text } }));
    }
  }

  return (
    <section className="rounded-2xl border-2 border-dashed border-ember/50 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Try to cheat</h2>
        <p className="muted">Each button asks the real contract to do something dishonest with GP-{project.id}. Nothing is changed and no wallet is needed.</p>
      </div>
      <ol className="space-y-3">
        {attacks.map((a, i) => {
          const r = results[a.id];
          return (
            <li key={a.id} className="border-t border-line pt-3">
              <div className="flex items-center gap-3">
                <span className="font-display font-bold w-5 shrink-0">{i + 1}</span>
                <span className="flex-1">{a.title}</span>
                <button className="btn-danger shrink-0 w-28" disabled={a.disabled || r?.busy} onClick={() => attack(a)}>{r?.busy ? "Trying…" : "Try it"}</button>
              </div>
              {r && !r.busy && (
                <p className={`pl-8 mt-2 font-bold ${r.ok ? "text-leaf" : r.plain ? "muted" : "text-ember"}`}>
                  {r.ok ? "🛡 " : ""}{r.text}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-sm muted">Same rules as a real transaction. The contract test suite sends all five as real transactions and checks that each is refused.</p>
    </section>
  );
}
