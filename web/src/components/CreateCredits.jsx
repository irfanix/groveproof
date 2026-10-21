// "Create credits": register the land, let the verifier record the verdict, then create the credits.
import { useState } from "react";
import { Link } from "react-router-dom";
import { recordOnChain } from "../lib/api";
import { connectWallet, explainError, gasFor, getProject, hasChain, makeMeta, reader, sendTx } from "../lib/chain";
import TxSteps from "./TxSteps";

const LABELS = ["Connect your wallet", "Register the land (map cells)", "Satellite verifier records the verdict", "Create the credits"];

export default function CreateCredits({ payload, name }) {
  const credits = payload.result.credits.credits;
  const [steps, setSteps] = useState(LABELS.map((label) => ({ label, status: "todo" })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState(null);

  if (!hasChain()) {
    return <p className="panel p-5 muted">The smart contract is not connected in this demo, so credits cannot be created here.</p>;
  }

  const set = (i, patch) => setSteps((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function start() {
    setBusy(true);
    setError("");
    let i = 0;
    try {
      set(0, { status: "wallet" });
      const { contract, address } = await connectWallet();
      set(0, { status: "confirmed", note: `Connected as ${address.slice(0, 6)}…${address.slice(-4)}` });

      // If this land was already registered by you (for example the page was refreshed half way), carry on from there.
      i = 1;
      let pid = Number(await reader().cellProject(BigInt(payload.cells[0])));
      let project = pid ? await getProject(pid) : null;
      if (project && project.owner.toLowerCase() === address.toLowerCase()) {
        set(1, { status: "confirmed", note: `Already registered as project GP-${pid}` });
      } else {
        const regArgs = [payload.cells.map((c) => BigInt(c)), makeMeta(payload.check_id, name)];
        const regGas = await gasFor("registerProject", regArgs, address);
        const receipt = await sendTx(
          () => contract.registerProject(...regArgs, regGas),
          (st, tx) => set(1, { status: st, tx }),
        );
        const ev = receipt.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
          .find((e) => e?.name === "ProjectRegistered");
        pid = Number(ev.args.projectId);
        set(1, { note: `Registered as project GP-${pid}, ${payload.cells.length} map cell${payload.cells.length === 1 ? "" : "s"}` });
        project = null;
      }
      setProjectId(pid);

      i = 2;
      if (project?.verdict === "Verified" && project.maxCredits > 0) {
        set(2, { status: "confirmed", note: `Already recorded: Verified, at most ${project.maxCredits} credits` });
      } else {
        set(2, { status: "working" });
        const rec = await recordOnChain(pid, payload.check_id);
        set(2, { status: "confirmed", tx: rec.tx || undefined, note: `Verdict ${rec.verdict}, at most ${rec.max_credits} credits` });
      }

      i = 3;
      project = await getProject(pid);
      // MetaMask's own network node can be a few seconds behind ours; give it time to see the verdict.
      await new Promise((r) => setTimeout(r, 6000));
      const left = project.maxCredits - project.issued;
      if (left <= 0) {
        set(3, { status: "confirmed", note: `${project.issued} credits already created` });
      } else {
        const amount = Math.min(credits, left);
        const gas = await gasFor("issueCredits", [pid, amount], address);
        await sendTx(() => contract.issueCredits(pid, amount, gas), (st, tx) => set(3, { status: st, tx }));
        set(3, { note: `${amount} credits created` });
      }
    } catch (e) {
      const msg = e.message && !e.code && !e.data && !e.revert ? e.message : explainError(e).text;
      set(i, { status: "failed", note: msg });
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const done = steps[3].status === "confirmed";
  return (
    <section className="panel p-5 space-y-4">
      <h2 className="text-2xl font-bold">Create {credits} credits</h2>
      <p className="muted">You will confirm two small test transactions in MetaMask. The contract only allows up to {credits} credits for this forest.</p>
      <TxSteps steps={steps} />
      {error && <p role="alert" className="text-ember font-bold">{error}</p>}
      {done ? (
        <Link className="btn-main" to={`/lookup?q=GP-${projectId}`}>See project GP-{projectId}</Link>
      ) : (
        <button className="btn-main w-full" onClick={start} disabled={busy}>{busy ? "Working…" : "Create credits"}</button>
      )}
    </section>
  );
}
