import type { ProofRun, ProofPublicRun } from "./proof-contract";
type Run = ProofRun | ProofPublicRun;
export function proofPackSummary(run: Run) {
  const ai = run.analysis.aiReview;
  return {
    title: run.input.title,
    workflow: run.input.workflow,
    status: run.status,
    outcome:
      run.status === "completed"
        ? "Approved packet delivered to the first-party sandbox and independently verified."
        : run.status === "rejected"
          ? "Human rejected the packet. No sandbox delivery was authorized."
          : run.status === "blocked"
            ? "Evidence checks blocked this packet before approval."
            : "This run has no completed, verified outcome yet.",
    passed: run.analysis.findings.filter((f) => f.passed).length,
    total: run.analysis.findings.length,
    documents: run.input.documents.length,
    ai: ai
      ? `${ai.model} · ${ai.durationMs} ms · ${ai.inputTokens ?? "unknown"} input / ${ai.outputTokens ?? "unknown"} output tokens${ai.estimatedCostMicros !== null ? ` · $${(ai.estimatedCostMicros / 1000000).toFixed(6)} estimated model cost` : ""}`
      : run.graph?.mode === "live-ai"
        ? "Rule assessment plus original live AI graph (see graph evidence)"
        : "Deterministic rules; no live model call",
    decision: run.review
      ? `${run.review.decision} · ${run.review.actor} · ${run.review.at}`
      : "No human decision recorded",
    receipt: run.receipt?.id ?? "No verified receipt",
    recovery: run.input.recoveryDemo
      ? `Deliberate response-loss demonstration · ${run.delivery.attempts} attempts · ${run.status === "completed" ? "recovered" : "not recovered"}`
      : null,
  };
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Standalone printable artifact. Raw input files and workspace keys are excluded; graph output may quote source text. */
export function proofPackHtml(run: Run) {
  const s = proofPackSummary(run);
  const pairs = [
    ["Outcome", s.outcome],
    [
      "Policy checks",
      `${s.passed}/${s.total} passed across ${s.documents} documents`,
    ],
    ["Execution", s.ai],
    ["Human decision", s.decision],
    ["Sandbox receipt", s.receipt],
    ["Run ID", run.id],
    ["Created", run.createdAt],
    ["Policy", run.analysis.policyVersion],
    ["Input fingerprint", run.analysis.fingerprint],
    ...(run.graph
      ? [
          [
            "Original graph",
            `Workflow ${run.graph.workflowRunId} · ${run.graph.mode} · ${run.graph.state}`,
          ],
          ["Graph fingerprint", run.graph.fingerprint ?? "Incomplete"],
          [
            "Graph finalization",
            run.graph.finalization?.state ?? "Not finalized",
          ],
          [
            "Receipt graph binding",
            run.receipt?.graph?.fingerprint ?? "No verified graph receipt",
          ],
        ]
      : []),
    ...(s.recovery ? [["Recovery", s.recovery]] : []),
  ];
  const github = run.githubHandoff;
  const retrieval = run.analysis.retrieval;
  const policyHtml = retrieval
    ? `<h2>Retrieved policy evidence</h2><section><p>Method: keyword search against a fictional catalog. Query: ${escape(retrieval.query)}. Catalog: ${escape(retrieval.catalogVersion)}.</p><p>Missing rule sources: ${escape(retrieval.missingFields.join(", ") || "None")}.</p>${retrieval.passages.map((p) => `<p><strong>${escape(p.title)} · v${escape(p.version)} · line ${p.line}</strong><br>${escape(p.quote)}<br><small>Matched: ${escape(p.matchedTerms.join(", "))} · SHA-256 ${escape(p.documentHash)}</small></p>`).join("")}</section>`
    : "";
  const graphHtml = run.graph?.snapshot
    ? `<h2>Original graph evidence</h2><p>Graph advice is advisory. Tool records identify simulations; memory_search records actual keyword retrieval. Confidence is uncalibrated.</p>${run.graph.snapshot.nodes.map((n) => `<section><h3>${escape(n.index + 1)}. ${escape(n.name)}</h3><p>${escape(n.agent)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(JSON.stringify(n.output, null, 2))}</pre></section>`).join("")}<h3>Tools and retrieved knowledge</h3><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(JSON.stringify(run.graph.snapshot.tools, null, 2))}</pre>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(s.title)} — AgentOps proof</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#172033;background:#f4f5fa;margin:0}main{max-width:1000px;margin:auto;padding:40px 24px}header{border-top:5px solid #7655e9}h1{font-size:36px;line-height:1.15}h2{margin-top:32px}small{color:#526078}dl,section{background:white;border:1px solid #dddfea;border-radius:12px;padding:24px}dt{font-weight:700;margin-top:16px}dd{margin:0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;border:1px solid #dddfea;padding:12px;overflow-wrap:anywhere}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #7655e9}code{overflow-wrap:anywhere}@media print{body{background:white}main{padding:0}section,dl,tr{break-inside:avoid}}@media(max-width:600px){h1{font-size:28px}th,td{padding:6px;font-size:13px}}</style></head><body><main><header><p>AGENTOPS / EXECUTION PROOF</p><h1>${escape(s.title)}</h1><p>Synthetic demonstration · ${escape(s.workflow)} · ${escape(s.status)}</p></header><dl>${pairs.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join("")}</dl>${policyHtml}${graphHtml}<h2>Evidence behind the decision</h2><table><thead><tr><th>Check</th><th>Result</th><th>Source</th></tr></thead><tbody>${run.analysis.findings
    .map(
      (f) =>
        `<tr><td>${escape(f.label)}</td><td>${f.passed ? "Passed" : "Blocked"}</td><td>${
          f.citationIds
            .map((id) => run.analysis.citations.find((c) => c.id === id))
            .filter(Boolean)
            .map(
              (c) =>
                `<small>${escape(c!.name)} · ${c!.page ? `PDF page ${c!.page} · extracted line ${c!.pageLine}` : `line ${c!.line}`}${c!.sourceKind === "edited-pdf-text" ? " · edited evidence" : ""}</small><blockquote>${escape(c!.quote)}</blockquote>`,
            )
            .join("") || "No matching source supplied"
        }</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table>${github ? `<h2>External handoff</h2><section>${escape(github.repository)} · issue ${escape(github.issueNumber ?? "unknown")} · ${escape(github.status)}<br>${escape(github.url ?? "No verified external URL")}<br>Verified at: ${escape(github.verifiedAt ?? "Not verified")}</section>` : ""}<h2>Recorded timeline</h2><section>${run.events.map((e) => `<p><small>${escape(e.at)}</small><br><strong>${escape(e.action)}</strong><br>${escape(e.detail)}</p>`).join("")}</section><p><small>Original source files and workspace credentials are excluded. Graph outputs may quote uploaded text. Cited quotes and operator notes in the timeline are included: review before sharing. Browser operator identity is not verified user authentication. These fictional rules establish no clinical eligibility, compliance or real payer/payment action. The sandbox is first-party. Any GitHub handoff is a separate action and must have its own verified result. Downloaded copies cannot be revoked; shared links can be revoked by their owner.</small></p></main></body></html>`;
}
