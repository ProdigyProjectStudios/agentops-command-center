import type { ProofAnalysis } from "@workspace/api-zod";
export function ConnectedProof({ analysis }: { analysis: ProofAnalysis }) {
  const retrieval = analysis.retrieval;
  if (!retrieval) return null;
  return (
    <section className="rounded-xl border border-primary/30 bg-card p-5 space-y-5 min-w-0">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">
          Connected evidence workflow
        </p>
        <h2 className="font-semibold text-xl mt-2">
          The policy behind the decision
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Document evidence → policy retrieval → review → human decision →
          verified delivery
        </p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground">Retrieval method</p>
          <p>
            {retrieval.method === "exact-policy-id"
              ? "Exact policy ID · saved versioned mapping"
              : "Keyword search · fictional policy catalog"}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground">Rule sources</p>
          <p>
            {retrieval.requiredFields.length - retrieval.missingFields.length}/
            {retrieval.requiredFields.length} found
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground">Specialist execution</p>
          <p>
            {analysis.specialists?.length
              ? `${analysis.specialists.length} live model reviews`
              : "Deterministic checks only; no specialist model calls"}
          </p>
        </div>
      </div>
      <p className="text-sm break-words">
        Query: <strong>{retrieval.query}</strong>
      </p>
      {retrieval.missingFields.length > 0 && (
        <p role="alert" className="text-sm text-amber-400">
          Insufficient policy evidence. Approval is blocked. Missing sources:{" "}
          {retrieval.missingFields.join(", ")}.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {retrieval.method === "exact-policy-id"
          ? "The selected policy version and exact criteria are frozen with this run. No semantic ranking is claimed."
          : "Matches are literal keyword overlaps, not semantic relevance or confidence scores. These synthetic policy passages are frozen with this run."}
      </p>
      <div className="space-y-2">
        {retrieval.passages.map((p) => (
          <details key={p.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">
              {p.field} · {p.title} · v{p.version} · line {p.line}
            </summary>
            <blockquote className="border-l-2 border-primary pl-3 my-3 text-sm">
              {p.quote}
            </blockquote>
            <p className="text-xs text-muted-foreground">
              {retrieval.method === "exact-policy-id"
                ? `Selected policy: ${p.documentId}`
                : `Matched: ${p.matchedTerms.join(", ")} · ${p.score} distinct query terms`}
            </p>
            <p className="font-mono break-all text-xs text-muted-foreground mt-2">
              Saved mapping SHA-256: {p.documentHash}
            </p>
          </details>
        ))}
      </div>
      {!!analysis.specialists?.length && (
        <div className="space-y-3">
          <h3 className="font-semibold">Recorded specialist reviews</h3>
          {analysis.specialists.map((s) => (
            <details key={s.role} className="border rounded-lg p-3">
              <summary className="cursor-pointer text-sm">
                {s.role} · {s.review.model} · {s.review.durationMs} ms
              </summary>
              <p className="text-xs text-muted-foreground mt-2">
                {s.review.inputTokens ?? "Unknown"} input /{" "}
                {s.review.outputTokens ?? "unknown"} output tokens · advisory
                only
              </p>
              {s.review.notes.map((n, i) => (
                <p className="text-sm mt-3" key={i}>
                  {n.explanation}{" "}
                  <span className="font-mono text-xs text-primary">
                    [{n.citationIds.join(", ")}]
                  </span>
                </p>
              ))}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
