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

export interface ProofDelivery {
  submit(run: ProofRun): Promise<ProofReceipt>;
  verify(run: ProofRun): Promise<ProofReceipt>;
}
const event = (run: ProofRun, action: string, detail: string) =>
  run.events.push({ at: new Date().toISOString(), action, detail });
export class ProofService {
  constructor(
    public store: ProofStore,
    private delivery: ProofDelivery,
    private aiReview?: (
      input: ProofInput,
      analysis: ProofAnalysis,
    ) => Promise<NonNullable<ProofAnalysis["aiReview"]>>,
  ) {}
  async create(owner: string, input: ProofInput) {
    const analysis = assessProof(input),
      at = new Date().toISOString();
    if (input.analysisMode === "live-ai") {
      if (!this.aiReview)
        throw new ProofError(
          503,
          "Live AI review is not configured. Use rules mode or configure provider credentials.",
        );
      analysis.aiReview = await this.aiReview(input, analysis);
    }
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
      const assessment = assessProof(current.input);
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
      current.status =
        review.decision === "reject" ? "rejected" : "delivery-failed";
      event(
        current,
        `Operator ${review.decision === "approve" ? "approved" : "rejected"}`,
        review.note,
      );
    });
    return review.decision === "approve" ? this.deliver(owner, id) : run;
  }
  async deliver(owner: string, id: string) {
    const run = await this.store.mutate(id, owner, (current) => {
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
        canonicalJson(verified.packet) !== canonicalJson(run.analysis.fields)
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
          "The sandbox response could not be verified. Retry uses the same run ID to prevent duplicate ledger entries.";
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
