import { randomUUID } from "node:crypto";
import type {
  ProofInput,
  ProofRun,
  ProofReview,
  ProofReceipt,
  ProofAnalysis,
} from "@workspace/api-zod";
import { assessProof, canonicalJson } from "./proof-assessment";
import { ProofStore, ProofError } from "./proof-store";
import { analyzeProof, type ProofReviewer } from "./proof-connected";
import { evaluateProof } from "./proof-evaluations";
import {
  graphFingerprint,
  assertGraphReviewed,
  type ProofGraphAdapter,
} from "./proof-graph";

export interface ProofDelivery {
  submit(run: ProofRun): Promise<ProofReceipt>;
  verify(run: ProofRun): Promise<ProofReceipt>;
}
const event = (run: ProofRun, action: string, detail: string) =>
  run.events.push({ at: new Date().toISOString(), action, detail });
export class ProofService {
  private evaluationsInProgress = new Set<string>();
  constructor(
    public store: ProofStore,
    private delivery: ProofDelivery,
    private aiReview?: ProofReviewer,
    private graph?: ProofGraphAdapter,
  ) {}
  async runGraph(owner: string, id: string, mode: "demo" | "live-ai") {
    if (!this.graph)
      throw new ProofError(
        503,
        "The original graph is not available in this environment.",
      );
    await this.store.get(owner, id);
    return this.graph.withLock(id, async () => {
      const run = await this.store.mutate(
        id,
        owner,
        async (current, client) => {
          if (current.status !== "awaiting-review" || current.review)
            throw new ProofError(
              409,
              "Start the graph before human review, on a packet that passed its rule checks.",
            );
          if (current.graph && current.graph.mode !== mode)
            throw new ProofError(
              409,
              "The graph mode is immutable. Create a new proof run to change it.",
            );
          if (current.graph?.state === "ready") return;
          current.graph = {
            workflowRunId:
              current.graph?.workflowRunId ??
              (await this.graph!.prepare(current, client)),
            mode,
            state: "running",
            startedAt: current.graph?.startedAt ?? new Date().toISOString(),
          };
          event(
            current,
            "Original graph started or resumed",
            `Workflow ${current.graph.workflowRunId}; ${mode}. Approval remains locked until every node completes.`,
          );
        },
      );
      if (run.graph!.state === "ready") return run;
      try {
        const snapshot = await this.graph!.execute(
          run.graph!.workflowRunId,
          mode,
        );
        return await this.store.mutate(id, owner, (current) => {
          current.graph = {
            ...current.graph!,
            state: "ready",
            snapshot,
            fingerprint: graphFingerprint(current, snapshot),
            completedAt: new Date().toISOString(),
          };
          event(
            current,
            "Original graph ready for human review",
            `${snapshot.nodes.length} saved nodes; output fingerprint ${current.graph.fingerprint}. Model advice does not replace source checks.`,
          );
        });
      } catch {
        return this.store.mutate(id, owner, (current) => {
          current.graph!.state = "failed";
          current.graph!.error =
            "The original graph did not complete. Inspect its workflow steps and model configuration, then resume this same graph. Completed nodes are retained; approval and delivery remain blocked.";
          event(
            current,
            "Original graph needs attention",
            current.graph!.error,
          );
        });
      }
    });
  }
  async finalizeGraph(owner: string, id: string) {
    if (!this.graph)
      throw new ProofError(
        503,
        "The original graph is not available in this environment.",
      );
    await this.store.get(owner, id);
    return this.graph.withLock(id, async () => {
      const run = await this.store.get(owner, id);
      if (!run.graph || !run.review)
        throw new ProofError(409, "A graph and human decision are required.");
      assertGraphReviewed(run);
      if (run.graph.finalization?.state === "completed") return run;
      try {
        const finalization = await this.graph!.finalize(run);
        return await this.store.mutate(id, owner, (current) => {
          current.graph!.finalization = finalization;
          event(
            current,
            "Original graph decision finalized",
            `Workflow ${current.graph!.workflowRunId}: ${current.review!.decision}. This records follow-up preparation; only the separately verified receipt proves delivery.`,
          );
        });
      } catch {
        return this.store.mutate(id, owner, (current) => {
          current.graph!.finalization = {
            state: "failed",
            at: new Date().toISOString(),
            error:
              "Graph finalization could not be confirmed. Retry uses the same saved human decision.",
          };
          event(
            current,
            "Graph finalization needs retry",
            current.graph!.finalization.error!,
          );
        });
      }
    });
  }
  async evaluate(owner: string, mode: "rules" | "live-ai", label: string) {
    if (this.evaluationsInProgress.has(owner))
      throw new ProofError(
        409,
        "An evaluation is already running in this workspace.",
      );
    if (mode === "live-ai" && !this.aiReview)
      throw new ProofError(503, "Live AI review is not configured.");
    this.evaluationsInProgress.add(owner);
    try {
      return await this.store.saveEvaluation(
        owner,
        await evaluateProof(mode, label, this.aiReview),
      );
    } finally {
      this.evaluationsInProgress.delete(owner);
    }
  }
  async create(owner: string, input: ProofInput) {
    if (input.supersedesRunId) {
      const prior = await this.store.get(owner, input.supersedesRunId);
      if (
        prior.input.workflow !== input.workflow ||
        prior.input.healthcarePolicy !== input.healthcarePolicy
      )
        throw new ProofError(
          409,
          "The prior run must belong to the same workflow and policy.",
        );
    }
    const analysis = await analyzeProof(input, this.aiReview),
      at = new Date().toISOString();
    const run: ProofRun = {
      id: randomUUID(),
      input,
      analysis,
      status: analysis.blockers.length ? "blocked" : "awaiting-review",
      createdAt: at,
      updatedAt: at,
      review: null,
      receipt: null,
      delivery: {
        attempts: 0,
        lastAttemptAt: null,
        verifiedAt: null,
        error: null,
      },
      events: [],
    };
    if (input.supersedesRunId)
      event(
        run,
        "Prior run retained",
        `This run follows ${input.supersedesRunId}; its evidence and decision remain unchanged.`,
      );
    event(
      run,
      "Documents received",
      `${input.documents.length} text document(s) saved. Inputs are immutable for this run.`,
    );
    event(
      run,
      "Evidence extracted",
      `${analysis.citations.length} exact source lines linked to ${analysis.findings.length} policy checks.`,
    );
    if (analysis.retrieval)
      event(
        run,
        "Policy retrieval recorded",
        `${analysis.retrieval.method} search: ${analysis.retrieval.passages.length} versioned passages; ${analysis.retrieval.missingFields.length} missing rule sources. Query: ${analysis.retrieval.query}`,
      );
    for (const s of analysis.specialists ?? [])
      event(
        run,
        "Specialist review completed",
        `${s.role} · ${s.review.model} · ${s.review.notes.length} cited advisory notes · ${s.review.durationMs} ms. Human approval remains required.`,
      );
    for (const doc of input.documents) {
      if (doc.pdf)
        event(
          run,
          "PDF extraction reviewed",
          `${doc.name}: ${doc.pdf.pageStarts.length} pages, SHA-256 ${doc.pdf.sha256}. Browser-extracted text and page references were reviewed by the operator. Original PDF bytes are not retained or independently verified by the server.`,
        );
      if (doc.editedFromPdf)
        event(
          run,
          "Edited PDF evidence",
          `${doc.name}: operator-editable text derived from ${doc.editedFromPdf.name}, SHA-256 ${doc.editedFromPdf.sha256}. PDF page references were removed; citations refer to the edited text.`,
        );
    }
    if (analysis.aiReview)
      event(
        run,
        "Live AI review completed",
        `${analysis.aiReview.model}; ${analysis.aiReview.notes.length} cited advisory notes. Rule checks and human approval remain authoritative.`,
      );
    event(
      run,
      analysis.blockers.length ? "Policy blocked" : "Human review required",
      analysis.summary,
    );
    return this.store.create(owner, run);
  }
  async review(owner: string, id: string, review: ProofReview) {
    const run = await this.store.mutate(id, owner, (current) => {
      if (current.status !== "awaiting-review")
        throw new ProofError(409, "This run is not awaiting review.");
      if (
        current.input.healthcarePolicy &&
        (!current.analysis.aiReview ||
          current.analysis.specialists?.length !== 3)
      )
        throw new ProofError(
          409,
          "Complete all three live evidence reviews before deciding this authorization packet. Rules-only checks cannot be submitted as an AI worker result.",
        );
      const assessment = assessProof(current.input, current.analysis.retrieval);
      if (
        assessment.blockers.length ||
        assessment.fingerprint !== review.fingerprint ||
        current.analysis.fingerprint !== review.fingerprint
      )
        throw new ProofError(
          409,
          "Evidence or policy changed. Create and review a new run.",
        );
      current.review = {
        ...review,
        at: new Date().toISOString(),
        actor: "browser operator",
      };
      assertGraphReviewed(current);
      current.status =
        review.decision === "reject" ? "rejected" : "delivery-failed";
      event(
        current,
        `Operator ${review.decision === "approve" ? "approved" : "rejected"}`,
        review.note,
      );
    });
    return review.decision === "approve"
      ? this.deliver(owner, id)
      : run.graph
        ? this.finalizeGraph(owner, id)
        : run;
  }
  async deliver(owner: string, id: string) {
    let run = await this.store.mutate(id, owner, (current) => {
      const stale =
        current.status === "delivering" &&
        Date.now() - Date.parse(current.delivery.lastAttemptAt!) > 30_000;
      if (current.status !== "delivery-failed" && !stale)
        throw new ProofError(
          409,
          "Delivery is already running or this run is not approved for retry.",
        );
      if (current.review?.decision !== "approve")
        throw new ProofError(409, "Approval is required.");
      assertGraphReviewed(current);
      current.status = "delivering";
      current.delivery.attempts++;
      current.delivery.lastAttemptAt = new Date().toISOString();
      current.delivery.error = null;
      event(
        current,
        "HTTP delivery started",
        `Attempt ${current.delivery.attempts}; idempotency key is this run's ID.`,
      );
    });
    try {
      if (run.graph) {
        run = await this.finalizeGraph(owner, id);
        if (run.graph!.finalization?.state !== "completed")
          throw new Error("Graph finalization incomplete");
      }
      const receipt = await this.delivery.submit(run);
      if (run.input.recoveryDemo && run.delivery.attempts === 1) {
        await this.store.mutate(id, owner, (current) => {
          event(
            current,
            "Demonstration fault injected",
            "The receiver accepted the packet. This walkthrough deliberately discards the first response to demonstrate uncertain delivery and safe retry.",
          );
        });
        throw new Error(
          "Demonstration: response lost after receiver acceptance",
        );
      }
      const verified = await this.delivery.verify(run);
      if (
        receipt.id !== verified.id ||
        verified.runId !== id ||
        verified.fingerprint !== run.analysis.fingerprint ||
        canonicalJson(verified.packet) !== canonicalJson(run.analysis.fields) ||
        canonicalJson(verified.graph ?? null) !==
          canonicalJson(
            run.graph
              ? {
                  workflowRunId: run.graph.workflowRunId,
                  fingerprint: run.graph.fingerprint,
                }
              : null,
          )
      )
        throw new Error("Receipt verification mismatch");
      return await this.store.mutate(id, owner, (current) => {
        if (
          current.delivery.attempts !== run.delivery.attempts ||
          current.status === "completed"
        )
          return;
        current.status = "completed";
        current.receipt = verified;
        current.delivery.verifiedAt = new Date().toISOString();
        event(
          current,
          "Receipt verified",
          `${verified.id}; independently retrieved from the sandbox ledger over HTTP.`,
        );
      });
    } catch {
      return this.store.mutate(id, owner, (current) => {
        if (
          current.delivery.attempts !== run.delivery.attempts ||
          current.status === "completed"
        )
          return;
        current.status = "delivery-failed";
        current.delivery.error =
          current.graph && current.graph.finalization?.state !== "completed"
            ? "Graph finalization is incomplete. Retry finalizes the saved decision before any sandbox delivery."
            : "The sandbox response could not be verified. Retry uses the same run ID to prevent duplicate ledger entries.";
        event(current, "Delivery needs retry", current.delivery.error);
      });
    }
  }
}

export function httpProofDelivery(
  base: () => string,
  secret: string,
): ProofDelivery {
  async function call(path: string, body?: object): Promise<ProofReceipt> {
    const response = await fetch(`${base()}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Sandbox HTTP ${response.status}`);
    return response.json() as Promise<ProofReceipt>;
  }
  return {
    submit: (run) =>
      call("/submissions", {
        runId: run.id,
        fingerprint: run.analysis.fingerprint,
      }),
    verify: (run) => call(`/receipts/${run.id}`),
  };
}
