import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import type { ProofEvaluation } from "@workspace/api-zod";
import { proofApi, downloadProof } from "@/lib/proof-api";
import { proofPanel, proofButton } from "@/components/proof/ProofEvidence";
const inputClass = "w-full bg-background border rounded-lg px-3 py-2 text-sm";
const money = (n: number | null) =>
  n === null ? "Unknown" : `$${(n / 1_000_000).toFixed(6)}`;
export default function ProofEvaluationsPage() {
  const cache = useQueryClient();
  const reports = useQuery({
    queryKey: ["proof-evaluations"],
    queryFn: () => proofApi<ProofEvaluation[]>("/evaluations"),
  });
  const [mode, setMode] = useState<"rules" | "live-ai">("rules");
  const [label, setLabel] = useState("Baseline evaluation");
  const [confirmed, setConfirmed] = useState(false);
  const [operatorKey, setOperatorKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [baseline, setBaseline] = useState("");
  const data = reports.data ?? [];
  const active = data.find((r) => r.id === selected) ?? data[0];
  const previous = data.find((r) => r.id === baseline);
  const compatible =
    active && previous && active.datasetVersion === previous.datasetVersion;
  async function run() {
    setBusy(true);
    setError("");
    try {
      const report = await proofApi<ProofEvaluation>(
        "/evaluations",
        "POST",
        {
          mode,
          label,
          liveCostAcknowledged: confirmed,
        },
        mode === "live-ai"
          ? { "x-proof-integration-key": operatorKey }
          : undefined,
      );
      setSelected(report.id);
      await cache.invalidateQueries({ queryKey: ["proof-evaluations"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally {
      setOperatorKey("");
      setBusy(false);
    }
  }
  return (
    <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 min-w-0">
      <div>
        <p className="text-xs tracking-widest uppercase text-primary">
          Measured evidence
        </p>
        <h1 className="text-3xl font-semibold mt-2">Evaluation lab</h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-3xl">
          Compare repeatable gate and source-citation checks across saved runs.
          Three valid packets and three blocked cases exercise the connected
          workflow. Evaluations never approve, deliver or create external
          issues.
        </p>
      </div>
      <section className={`${proofPanel} space-y-4`}>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm space-y-2">
            <span>Evaluation label</span>
            <input
              className={inputClass}
              maxLength={100}
              value={label}
              disabled={busy}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="text-sm space-y-2">
            <span>Execution mode</span>
            <select
              className={inputClass}
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                setConfirmed(false);
              }}
            >
              <option value="rules">
                Deterministic rules baseline — no AI cost
              </option>
              <option value="live-ai">
                Live specialist models — billed requests
              </option>
            </select>
          </label>
        </div>
        {mode === "live-ai" && (
          <div className="space-y-3">
            <label className="block text-sm space-y-2">
              <span>Integration operator key</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="off"
                value={operatorKey}
                disabled={busy}
                onChange={(e) => setOperatorKey(e.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                Required for billable benchmarks. Held only for this request;
                never saved in evaluation reports.
              </span>
            </label>
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I authorize nine specialist reviews using the configured models.
                Provider calls and retries may incur charges.
              </span>
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={`${proofButton} bg-primary text-primary-foreground`}
            disabled={
              busy ||
              label.trim().length < 3 ||
              (mode === "live-ai" && (!confirmed || operatorKey.length < 32))
            }
            onClick={run}
          >
            {busy ? "Running benchmark…" : "Run six-case benchmark"}
          </button>
          <Link className="text-sm text-primary" href="/settings">
            Model settings
          </Link>
          <Link className="text-sm text-primary" href="/proof-lab">
            Open connected workflow
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Results measure these six synthetic cases, not general model accuracy
          or production reliability. Citation checks validate source references,
          not the truth of every model explanation. Live failures remain
          failures; unknown usage stays unknown.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm text-primary">
            Running sequential checks. Live mode may take several minutes. Keep
            this page open.
          </p>
        )}
      </section>
      {reports.isPending && <p role="status">Loading saved evaluations…</p>}
      {reports.isError && (
        <p role="alert">
          Could not load evaluations.{" "}
          <button onClick={() => reports.refetch()} className="underline">
            Retry
          </button>
        </p>
      )}
      {!reports.isPending && !reports.isError && !data.length && (
        <p className="text-sm text-muted-foreground">
          No saved evaluations yet. Run a baseline to measure the current build.
        </p>
      )}
      {active && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-sm space-y-2">
              <span>Inspect saved evaluation</span>
              <select
                className={inputClass}
                value={active.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} · {r.mode} ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-2">
              <span>Compare with</span>
              <select
                className={inputClass}
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
              >
                <option value="">Choose a baseline</option>
                {data
                  .filter((r) => r.id !== active.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} · {r.mode}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <section className={`${proofPanel} space-y-4`}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-semibold text-xl">{active.label}</h2>
              <button
                className={proofButton}
                onClick={() =>
                  downloadProof(active, `agentops-evaluation-${active.id}.json`)
                }
              >
                Export evaluation JSON
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                [
                  "Gate & citation checks",
                  `${active.passed}/${active.total} passed`,
                ],
                ["Elapsed", `${active.durationMs} ms`],
                ["Completed model calls", active.modelCalls],
                ["Estimated model cost", money(active.estimatedCostMicros)],
              ].map(([k, v]) => (
                <div className="border rounded-lg p-3" key={k}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="text-lg mt-1">{v}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground break-words">
              Mode: {active.mode} · Models:{" "}
              {active.models.join(", ") || "No completed model calls"} · Tokens:{" "}
              {active.inputTokens ?? "unknown"} in /{" "}
              {active.outputTokens ?? "unknown"} out · {active.datasetVersion} ·{" "}
              {active.promptVersion}
            </p>
            {previous && previous.id !== active.id && (
              <p className="text-sm text-primary">
                {compatible
                  ? `Compared with ${previous.label}: ${active.passed - previous.passed >= 0 ? "+" : ""}${active.passed - previous.passed} passing cases; ${active.durationMs - previous.durationMs >= 0 ? "+" : ""}${active.durationMs - previous.durationMs} ms elapsed. Modes: ${previous.mode} → ${active.mode}.`
                  : "Different benchmark versions; results are not directly comparable."}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b">
                    <th className="p-3">Case</th>
                    <th className="p-3">Expected</th>
                    <th className="p-3">Observed</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {active.cases.map((c) => (
                    <tr key={c.name} className="border-b">
                      <td className="p-3">
                        {c.name}
                        {c.error && (
                          <p className="text-xs text-destructive mt-1">
                            {c.error}
                          </p>
                        )}
                      </td>
                      <td className="p-3">{c.expected}</td>
                      <td className="p-3">{c.actual}</td>
                      <td
                        className={`p-3 ${c.passed ? "text-emerald-400" : "text-amber-400"}`}
                      >
                        {c.passed ? "Passed" : "Failed"}
                      </td>
                      <td className="p-3">{c.durationMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
