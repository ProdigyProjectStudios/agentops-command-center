import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import type { ProofRun, ProofPublicRun } from "@workspace/api-zod";

export const proofPanel = "rounded-xl border border-border bg-card p-5";
export const proofButton =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium border border-border hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
export const proofDate = (at: string) => new Date(at).toLocaleString();
export function ProofEvidence({ run }: { run: ProofRun | ProofPublicRun }) {
  const [selected, setSelected] = useState(run.analysis.findings[0]?.id ?? "");
  const finding =
    run.analysis.findings.find((f) => f.id === selected) ??
    run.analysis.findings[0];
  const citations = run.analysis.citations.filter((c) =>
    finding?.citationIds.includes(c.id),
  );
  const aiNotes = run.analysis.aiReview?.notes.filter(
    (n) => n.findingId === finding?.id,
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["01 / Intake", `${run.input.documents.length} documents saved`],
          [
            "02 / Evidence",
            `${run.analysis.findings.filter((f) => f.passed).length}/${run.analysis.findings.length} checks passed`,
          ],
          [
            "03 / Review",
            run.review
              ? `${run.review.decision} · recorded`
              : "Human decision required",
          ],
          [
            "04 / Delivery",
            run.receipt ? "HTTP receipt verified" : "No verified delivery",
          ],
        ].map(([title, detail]) => (
          <div key={title} className={proofPanel}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className="text-sm font-medium mt-2">{detail}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className={proofPanel} aria-label="Policy findings">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={17} className="text-primary" />
            <h2 className="font-semibold">Every finding has a source.</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Select a check to inspect its evidence and explanation.
          </p>
          <div className="space-y-2">
            {run.analysis.findings.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelected(f.id)}
                aria-pressed={finding?.id === f.id}
                className={`w-full text-left rounded-lg p-3 border flex gap-3 items-start ${finding?.id === f.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"}`}
              >
                {f.passed ? (
                  <CheckCircle2
                    className="text-emerald-400 shrink-0 mt-0.5"
                    size={16}
                  />
                ) : (
                  <AlertTriangle
                    className="text-amber-400 shrink-0 mt-0.5"
                    size={16}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {f.passed ? "Passed" : "Blocked"} · {f.citationIds.length}{" "}
                    source line{f.citationIds.length === 1 ? "" : "s"}
                  </p>
                </div>
                <ArrowUpRight size={14} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
        <section className={proofPanel} aria-label="Source inspector">
          <div className="flex gap-2 items-center">
            <FileText size={17} className="text-primary" />
            <h2 className="font-semibold">Source inspector</h2>
          </div>
          <p className="text-sm mt-4 font-medium">{finding?.label}</p>
          <p className="text-sm text-muted-foreground mt-2 break-words">
            {finding?.explanation}
          </p>
          {citations.length === 0 && (
            <div className="border border-dashed border-amber-500/40 rounded-lg p-4 mt-5 text-sm text-amber-300">
              No matching source line was supplied. Missing evidence is never
              invented.
            </div>
          )}
          {citations.map((c) => (
            <div className="mt-4" key={c.id}>
              <p className="text-xs text-muted-foreground break-all">
                {c.name} · line {c.line} · {c.id}
              </p>
              <blockquote className="font-mono text-sm bg-primary/5 border-l-2 border-primary rounded-r-lg p-4 mt-2 whitespace-pre-wrap break-words">
                {c.quote}
              </blockquote>
            </div>
          ))}
          {!!aiNotes?.length && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs uppercase tracking-wider text-primary">
                Live AI interpretation · verify against sources
              </p>
              {aiNotes.map((n, i) => (
                <p className="text-sm mt-3 text-muted-foreground" key={i}>
                  {n.explanation}{" "}
                  <span className="font-mono text-xs">
                    [{n.citationIds.join(", ")}]
                  </span>
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-6">
            Policy: {run.analysis.policyVersion}. These fictional administrative
            checks do not establish clinical eligibility, coverage or payment
            authorization.
          </p>
        </section>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className={proofPanel}>
          <h2 className="font-semibold">Recorded execution</h2>
          <ol className="mt-4 space-y-4">
            {run.events.map((e, i) => (
              <li key={i} className="border-l-2 border-primary/30 pl-4">
                <p className="text-xs text-muted-foreground">
                  {proofDate(e.at)}
                </p>
                <p className="text-sm font-medium mt-1">{e.action}</p>
                <p className="text-sm text-muted-foreground mt-1 break-words">
                  {e.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <section className={`${proofPanel} space-y-4`}>
          <h2 className="font-semibold">Delivery evidence</h2>
          {run.receipt ? (
            <>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-emerald-400 font-medium">
                  Verified in the sandbox ledger
                </p>
                <p className="text-xs font-mono mt-2 break-all">
                  {run.receipt.id}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Received {proofDate(run.receipt.acceptedAt)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                A real HTTP POST created this saved record. A separate HTTP GET
                verified it. The destination is Agent Ops’s own sandbox; no
                external payment, EHR or payer action occurred.
              </p>
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Inspect accepted packet
                </summary>
                <pre className="text-xs whitespace-pre-wrap break-all bg-secondary/40 p-3 mt-3 rounded-lg">
                  {JSON.stringify(run.receipt.packet, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {run.delivery.error ??
                "The packet has not been submitted and verified. Complete the evidence checks and human review first."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Delivery attempts: {run.delivery.attempts}. Duplicate protection
            applies to retries of this run, not different runs with matching
            business references.
          </p>
          {run.analysis.aiReview ? (
            <div className="border-t border-border pt-4 text-xs text-muted-foreground space-y-2">
              <p className="text-primary">
                Live AI: {run.analysis.aiReview.model}
              </p>
              <p>
                Input tokens: {run.analysis.aiReview.inputTokens ?? "unknown"} ·
                Output tokens: {run.analysis.aiReview.outputTokens ?? "unknown"}
              </p>
              <p>
                {run.analysis.aiReview.durationMs} ms · Estimated model cost:{" "}
                {run.analysis.aiReview.estimatedCostMicros === null
                  ? "unavailable"
                  : `$${(run.analysis.aiReview.estimatedCostMicros / 1_000_000).toFixed(6)}`}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground border-t border-border pt-4">
              Execution: exact text extraction + deterministic rules. No live AI
              call was used for this run.
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Input fingerprint
            </summary>
            <p className="text-xs font-mono break-all mt-2">
              {run.analysis.fingerprint}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Identifies the evaluated inputs and policy. This is not a digital
              signature or a tamper-proof audit guarantee.
            </p>
          </details>
        </section>
      </div>
    </div>
  );
}
