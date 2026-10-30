import { useState } from "react";
import type { ProofRun, ProofPublicRun } from "@workspace/api-zod";
import { proofApi } from "@/lib/proof-api";
const panel = "rounded-xl border border-border bg-card p-5 space-y-3 min-w-0";
const button =
  "rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-40";
export function OriginalGraphEvidence({
  run,
}: {
  run: ProofRun | ProofPublicRun;
}) {
  const graph = run.graph;
  if (!graph) return null;
  return (
    <section className={panel} aria-label="Original agent graph evidence">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Original agent graph</h2>
        <span className="text-xs border border-border rounded px-2 py-1">
          {graph.mode === "demo"
            ? "Demo · zero model calls"
            : graph.state === "ready"
              ? "Live AI · complete validated responses"
              : "Live AI requested · incomplete"}
        </span>
      </div>
      <p className="text-sm">
        Workflow #{graph.workflowRunId} · {graph.state} ·{" "}
        {graph.snapshot?.nodes.length ?? 0}/7 nodes saved in this proof
      </p>
      <p className="text-xs text-muted-foreground">
        Graph recommendations are advisory. Source checks and your decision
        control delivery. Confidence values are uncalibrated. Simulated tools do
        not prove external execution.
      </p>
      {graph.mode === "demo" && (
        <p className="text-xs text-amber-400">
          Demo node narratives and estimates are preset illustrations, not
          extracted facts. The cited source fields control the approved packet.
        </p>
      )}
      {graph.error && (
        <p role="alert" className="text-sm text-amber-400">
          {graph.error}
        </p>
      )}
      {graph.snapshot && (
        <>
          <p className="text-sm">{graph.snapshot.summary}</p>
          {graph.snapshot.nodes.map((node) => (
            <details
              key={node.index}
              className="border border-border rounded-lg p-3"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {node.index + 1}. {node.name} · {node.agent}
              </summary>
              <p className="mt-2 text-sm">
                {String(node.output.summary ?? "")}
              </p>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs max-h-96 overflow-auto">
                {JSON.stringify(node.output, null, 2)}
              </pre>
            </details>
          ))}
          <details className="border border-border rounded-lg p-3">
            <summary className="cursor-pointer text-sm">
              Recorded tools and retrieved knowledge (
              {graph.snapshot.tools.length})
            </summary>
            <p className="text-xs text-muted-foreground mt-2">
              memory_search contains actual keyword retrieval results. Other
              original graph tool records are explicitly simulated.
            </p>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs max-h-96 overflow-auto">
              {JSON.stringify(graph.snapshot.tools, null, 2)}
            </pre>
          </details>
          <p className="text-xs break-all text-muted-foreground">
            Graph fingerprint: {graph.fingerprint}
          </p>
        </>
      )}
      {graph.finalization && (
        <div className="text-sm border-t border-border pt-3">
          <p>Graph decision finalization: {graph.finalization.state}</p>
          {graph.finalization.error && (
            <p className="text-amber-400">{graph.finalization.error}</p>
          )}
          {graph.finalization.node && (
            <details>
              <summary className="cursor-pointer">Final node output</summary>
              <pre className="whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(graph.finalization.node.output, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
      {run.receipt?.graph && (
        <p className="text-sm text-emerald-400">
          Receiver receipt binds this graph fingerprint to the approved packet.
        </p>
      )}
    </section>
  );
}
export function OriginalGraphActions({
  run,
  busy,
  action,
  save,
}: {
  run: ProofRun;
  busy: boolean;
  action: (label: string, fn: () => Promise<void>) => Promise<void>;
  save: (run: ProofRun) => Promise<void>;
}) {
  const [selected, setSelected] = useState<"demo" | "live-ai">("demo");
  const [key, setKey] = useState("");
  const [ack, setAck] = useState(false);
  const mode = run.graph?.mode ?? selected;
  if (
    run.status === "rejected" &&
    run.graph &&
    run.graph.finalization?.state !== "completed"
  )
    return (
      <section className={panel}>
        <p>Rejection is saved. Finish recording it in the original graph.</p>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            action("Finalizing the saved rejection…", async () =>
              save(
                await proofApi<ProofRun>(
                  `/runs/${run.id}/graph/finalize`,
                  "POST",
                ),
              ),
            )
          }
        >
          Retry graph finalization
        </button>
      </section>
    );
  if (run.status !== "awaiting-review" || run.graph?.state === "ready")
    return null;
  return (
    <section className={panel} aria-label="Run original agent graph">
      <h2 className="font-semibold">
        Run the original agent graph on this evidence
      </h2>
      <p className="text-sm text-muted-foreground">
        Seven saved nodes cover triage, knowledge lookup, legal, finance,
        communications, synthesis and the approval gate. After review, the final
        node records your decision and Proof Lab delivers the approved packet to
        its sandbox.
      </p>
      <p className="text-xs text-muted-foreground">
        Synthetic data only. The linked request and its documents also appear in
        the existing graph dashboard. Nothing is emailed or sent to an external
        service by its simulated tools.
      </p>
      {!run.graph && (
        <label className="block text-sm">
          Graph mode
          <select
            aria-label="Graph mode"
            value={mode}
            onChange={(e) => setSelected(e.target.value as typeof mode)}
            className="block mt-1 w-full rounded border border-border bg-background p-2"
          >
            <option value="demo">Demo graph — no model charges</option>
            <option value="live-ai">Live AI graph — six model calls</option>
          </select>
        </label>
      )}
      {mode === "live-ai" && (
        <>
          <label className="block text-sm">
            Integration operator key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="block w-full mt-1 rounded border border-border bg-background p-2"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I authorize six graph model calls and any retries, which may incur
            provider charges. Uploaded synthetic text is sent to the configured
            model provider.
          </label>
        </>
      )}
      <button
        className={button}
        disabled={busy || (mode === "live-ai" && (!ack || key.length < 32))}
        onClick={() =>
          action(
            "Running the original graph; this may take a few minutes…",
            async () => {
              const result = await proofApi<ProofRun>(
                `/runs/${run.id}/graph`,
                "POST",
                { mode, liveCostAcknowledged: ack },
                mode === "live-ai"
                  ? { "x-proof-integration-key": key }
                  : undefined,
              );
              setKey("");
              await save(result);
            },
          )
        }
      >
        {run.graph ? "Resume saved graph" : "Run original graph"}
      </button>
      {run.graph?.state === "running" && (
        <p className="text-xs text-muted-foreground">
          Refresh to see progress. Resume reconnects to the same workflow after
          an interruption; an active worker prevents duplicate execution.
        </p>
      )}
    </section>
  );
}
