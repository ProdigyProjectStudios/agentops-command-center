import type { ProofInput, ProofAnalysis } from "@workspace/api-zod";
import { assessProof } from "./proof-assessment";
import { ProofError } from "./proof-store";
import { validateProofAi } from "./proof-ai-contract";

export const proofPromptVersion = "grounded-specialists-v2";
export type ProofReviewer = (
  input: ProofInput,
  analysis: ProofAnalysis,
  role?: string,
) => Promise<NonNullable<ProofAnalysis["aiReview"]>>;
export const specialistRoles = [
  "ops-conductor",
  "legal-counsel",
  "finance-analyst",
] as const;
export async function analyzeProof(
  input: ProofInput,
  reviewer?: ProofReviewer,
): Promise<ProofAnalysis> {
  const analysis = assessProof(input);
  if (input.analysisMode !== "live-ai") return analysis;
  // Missing policy evidence must stop the model and approval path, not invite invention.
  if (analysis.retrieval?.missingFields.length) return analysis;
  if (!reviewer)
    throw new ProofError(
      503,
      "Live AI review is not configured. Use rules mode or configure provider credentials.",
    );
  if (!input.connectedReview && !input.healthcarePolicy) {
    analysis.aiReview = await reviewer(input, analysis);
    return analysis;
  }
  // Do not spend tokens reviewing packets that already fail deterministic evidence checks.
  if (analysis.blockers.length) return analysis;
  const specialists: NonNullable<ProofAnalysis["specialists"]> = [];
  const started = Date.now();
  const runSpecialist = async (
    role: (typeof specialistRoles)[number],
    prior: NonNullable<ProofAnalysis["specialists"]>,
  ) => {
    const review = await reviewer(
      input,
      { ...analysis, specialists: [...prior] },
      role,
    );
    review.notes = validateProofAi({ notes: review.notes }, analysis);
    if (
      analysis.findings.some(
        (f) => !review.notes.some((n) => n.findingId === f.id),
      )
    )
      throw new ProofError(
        502,
        `${role} omitted required finding reviews. No approval was created.`,
      );
    return { role, review };
  };
  if (input.healthcarePolicy === "cms-cpap-initial-v1") {
    // Intake and policy mapping are independent; packet review consumes both.
    specialists.push(...await Promise.all([
      runSpecialist("ops-conductor", []),
      runSpecialist("legal-counsel", []),
    ]));
    specialists.push(await runSpecialist("finance-analyst", specialists));
  } else {
    for (const role of specialistRoles) {
      specialists.push(await runSpecialist(role, specialists));
    }
  }
  const sum = (key: "inputTokens" | "outputTokens" | "estimatedCostMicros") =>
    specialists.some((s) => s.review[key] === null)
      ? null
      : specialists.reduce((n, s) => n + s.review[key]!, 0);
  analysis.specialists = specialists;
  analysis.aiReview = {
    model: [...new Set(specialists.map((s) => s.review.model))].join(" / "),
    notes: specialists.flatMap((s) => s.review.notes),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    estimatedCostMicros: sum("estimatedCostMicros"),
    durationMs: Date.now() - started,
  };
  return analysis;
}
