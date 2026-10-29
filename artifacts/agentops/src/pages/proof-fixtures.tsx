import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CheckCircle2,
  ShieldCheck,
  FileJson,
  ArrowRight,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";

type Run = {
  schemaVersion: string;
  policyVersion: string;
  scenarioId: string;
  title: string;
  status: string;
  fingerprint: string;
  evidence: {
    document: string;
    present: boolean;
    source: string;
    rule: string;
  }[];
  blockers: string[];
  receipt: { id: string; adapter: string; externalDelivery: boolean } | null;
  events: { at: string; actor: string; action: string; detail: string }[];
  packet: Record<string, unknown>;
};
type Scenario = { id: string; title: string; description: string };
const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/proof`;
const panel = "rounded-xl border border-border bg-card p-5";
const button =
  "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed";

export default function ProofLabPage() {
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{
    documents: string[];
    duplicate: boolean;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<{
    scenarios: Scenario[];
  }>({
    queryKey: ["proof-scenarios"],
    queryFn: async () => {
      const response = await fetch(`${api}/scenarios`);
      if (!response.ok) throw new Error("Could not load scenarios");
      return response.json();
    },
  });
  async function execute(
    scenarioId: string,
    decision?: "approve" | "reject",
    edited = false,
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${api}/${decision ? "review" : "evaluate"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId,
            ...(decision ? { decision } : {}),
            ...((edited || decision) && draft ? draft : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok && response.status !== 409)
        throw new Error(result.error || "Request failed");
      setRun(result);
      setDraft({
        documents: result.packet.documents,
        duplicate: result.packet.duplicate,
      });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!run) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `agentops-${run.scenarioId}-evidence.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-2 text-primary text-xs font-mono uppercase tracking-widest">
        <FlaskConical size={16} /> Executable proof / synthetic data
      </div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          From evidence to a controlled action.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-3xl">
          Run a healthcare administration case. Inspect its policy checks,
          resolve the human decision, and export the evidence from this session.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {[
          ["01 / Evaluate", "Versioned rules check the supplied evidence."],
          ["02 / Review", "An operator must approve a complete packet."],
          [
            "03 / Inspect",
            "A sandbox receipt and session evidence show the result.",
          ],
        ].map(([title, text]) => (
          <div className={panel} key={title}>
            <h2 className="font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground mt-2">{text}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm">
        These are fictional administrative policies and synthetic cases. The
        checks execute on the server. Submission uses a local simulator; no EHR,
        payer, clinical decision, or live AI call is involved. Evidence is
        downloadable and is not stored as a permanent audit record.
      </div>
      {isLoading && <p role="status">Loading scenarios…</p>}
      {isError && (
        <div role="alert">
          Scenarios could not load.{" "}
          <button className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {data?.scenarios.map((s) => (
          <button
            disabled={busy}
            key={s.id}
            onClick={() => execute(s.id)}
            className={`${panel} text-left hover:border-primary transition-colors disabled:opacity-50 ${run?.scenarioId === s.id ? "border-primary" : ""}`}
          >
            <div className="flex justify-between gap-3 font-medium">
              {s.title}
              <ArrowRight size={18} />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {s.description}
            </p>
          </button>
        ))}
      </div>
      {busy && (
        <p role="status" className="text-primary">
          Running server-side checks…
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {run && (
        <section className="space-y-4" aria-label="Run evidence">
          <div
            className={`${panel} flex flex-wrap gap-4 justify-between items-center`}
          >
            <div>
              <h2 className="text-lg font-semibold">{run.title}</h2>
              <p className="font-mono text-sm text-primary mt-1" role="status">
                {run.status.replaceAll("-", " ")}
              </p>
            </div>
            <button
              className={`${button} bg-secondary flex gap-2 items-center`}
              onClick={download}
            >
              <FileJson size={16} /> Export evidence
            </button>
          </div>
          {draft && (
            <div className={panel}>
              <h3 className="font-medium">Change the synthetic packet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Remove evidence or flag a duplicate, then re-run the checks. Any
                edit requires a fresh evaluation before approval.
              </p>
              <div className="flex flex-wrap gap-4 my-4">
                {run.evidence.map((e) => (
                  <label key={e.document} className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={draft.documents.includes(e.document)}
                      onChange={(event) => {
                        setDraft({
                          ...draft,
                          documents: event.target.checked
                            ? [...draft.documents, e.document]
                            : draft.documents.filter((d) => d !== e.document),
                        });
                        setDirty(true);
                      }}
                    />
                    {e.document}
                  </label>
                ))}
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={draft.duplicate}
                    onChange={(event) => {
                      setDraft({ ...draft, duplicate: event.target.checked });
                      setDirty(true);
                    }}
                  />
                  Duplicate reference
                </label>
              </div>
              <button
                className={`${button} bg-secondary`}
                disabled={busy || !dirty}
                onClick={() => execute(run.scenarioId, undefined, true)}
              >
                Re-evaluate edited packet
              </button>
              {dirty && (
                <span className="text-amber-400 text-sm ml-3">
                  Edits pending evaluation
                </span>
              )}
            </div>
          )}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className={panel}>
              <h3 className="font-medium mb-4">Evidence and policy</h3>
              <p className="text-xs font-mono text-muted-foreground mb-3 break-all">
                {run.policyVersion}
              </p>
              {run.evidence.map((e) => (
                <div key={e.document} className="border-t border-border py-3">
                  <div className="flex gap-2 items-center">
                    {e.present ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-400" />
                    )}
                    {e.document}
                    <span className="ml-auto text-xs">
                      {e.present ? "Present" : "Missing"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 break-all">
                    {e.source}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{e.rule}</p>
                </div>
              ))}
            </div>
            <div className={panel}>
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <ShieldCheck size={18} /> Human decision
              </h3>
              {run.blockers.length > 0 ? (
                <ul className="space-y-2 text-amber-400 text-sm">
                  {run.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The packet meets this demonstration policy. Review the
                  evidence before approving a sandbox submission.
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  className={`${button} bg-primary text-primary-foreground`}
                  disabled={busy || dirty || run.status !== "awaiting-review"}
                  onClick={() => execute(run.scenarioId, "approve")}
                >
                  Approve sandbox submission
                </button>
                <button
                  className={`${button} bg-secondary`}
                  disabled={busy || dirty || run.status !== "awaiting-review"}
                  onClick={() => execute(run.scenarioId, "reject")}
                >
                  Reject
                </button>
              </div>
              {run.receipt && (
                <div className="mt-5 rounded-lg bg-emerald-500/10 p-4">
                  <p className="font-medium text-emerald-400">
                    Sandbox receipt generated
                  </p>
                  <p className="text-xs font-mono mt-2">{run.receipt.id}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Repeated approvals of this fixture produce the same receipt
                    ID. No external submission is sent.
                  </p>
                </div>
              )}
              <details className="mt-5">
                <summary className="cursor-pointer text-sm">
                  Inspect submission packet
                </summary>
                <pre className="text-xs overflow-auto mt-3 p-3 bg-background rounded">
                  {JSON.stringify(run.packet, null, 2)}
                </pre>
              </details>
            </div>
          </div>
          <div className={panel}>
            <h3 className="font-medium mb-4">Session event trail</h3>
            {run.events.map((e, i) => (
              <div key={i} className="border-l-2 border-primary/30 pl-4 pb-4">
                <p className="text-sm font-medium">{e.action}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {e.actor} · {new Date(e.at).toLocaleTimeString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{e.detail}</p>
              </div>
            ))}
            <p className="text-xs font-mono text-muted-foreground break-all">
              Input fingerprint: {run.fingerprint}
            </p>
          </div>
        </section>
      )}
      <div className={`${panel} flex flex-wrap gap-5 text-sm`}>
        <span className="text-muted-foreground">Explore the wider system:</span>
        <Link href="/requests/new" className="text-primary">
          Multi-agent workflow →
        </Link>
        <Link href="/knowledge" className="text-primary">
          Retrieval and knowledge →
        </Link>
        <Link href="/architecture" className="text-primary">
          Architecture and controls →
        </Link>
      </div>
    </div>
  );
}
