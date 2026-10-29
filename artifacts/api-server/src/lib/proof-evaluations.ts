import { randomUUID } from "node:crypto";
import {
  proofTemplates,
  type ProofEvaluation,
  type ProofInput,
  type ProofAnalysis,
} from "@workspace/api-zod";
import {
  analyzeProof,
  proofPromptVersion,
  type ProofReviewer,
} from "./proof-connected";

export const datasetVersion = "connected-proof-benchmark-v1";
export function evaluationCases() {
  const valid = proofTemplates.map((t) => ({
    name: `${t.id}: valid evidence`,
    input: { ...structuredClone(t.input), connectedReview: true },
    expected: "awaiting-review" as const,
  }));
  const missing = structuredClone(valid[1].input);
  missing.documents[0].text = missing.documents[0].text.replace(
    "Supporting-note: present",
    "",
  );
  const duplicate = structuredClone(valid[0].input);
  duplicate.documents[0].text += "\nAmount: 1200";
  const noPolicy = {
    ...structuredClone(valid[0].input),
    policyQuery: "astronomy telescope",
  };
  return [
    ...valid,
    {
      name: "Missing supporting note",
      input: missing,
      expected: "blocked" as const,
    },
    {
      name: "Conflicting invoice amounts",
      input: duplicate,
      expected: "blocked" as const,
    },
    {
      name: "Insufficient policy retrieval",
      input: noPolicy,
      expected: "blocked" as const,
    },
  ];
}
export function citationsMatchInputs(
  input: ProofInput,
  analysis: ProofAnalysis,
) {
  return (
    analysis.citations.every((c) => {
      const doc = input.documents[c.document];
      return (
        !!doc &&
        doc.name === c.name &&
        doc.text.split(/\r?\n/)[c.line - 1] === c.quote
      );
    }) &&
    analysis.findings.every((f) =>
      f.citationIds.every((id) =>
        analysis.citations.some((c) => c.id === id && c.field === f.id),
      ),
    )
  );
}
export async function evaluateProof(
  mode: "rules" | "live-ai",
  label: string,
  reviewer?: ProofReviewer,
): Promise<ProofEvaluation> {
  const started = Date.now();
  const reviews: NonNullable<ProofAnalysis["aiReview"]>[] = [];
  let modelCalls = 0,
    unknownUsage = false;
  const tracked: ProofReviewer | undefined = reviewer
    ? async (...args) => {
        try {
          const result = await reviewer(...args);
          modelCalls++;
          reviews.push(result);
          return result;
        } catch (error) {
          unknownUsage = true;
          throw error;
        }
      }
    : undefined;
  const cases: ProofEvaluation["cases"] = [];
  for (const c of evaluationCases()) {
    const at = Date.now();
    try {
      const input = { ...c.input, analysisMode: mode };
      const analysis = await analyzeProof(input, tracked);
      const actual = analysis.blockers.length ? "blocked" : "awaiting-review";
      const citationsValid = citationsMatchInputs(input, analysis);
      cases.push({
        name: c.name,
        expected: c.expected,
        actual,
        citationsValid,
        passed: actual === c.expected && citationsValid,
        durationMs: Date.now() - at,
        error: null,
      });
    } catch {
      cases.push({
        name: c.name,
        expected: c.expected,
        actual: "execution-error",
        citationsValid: false,
        passed: false,
        durationMs: Date.now() - at,
        error:
          "Review failed or is unavailable. This case was not treated as a successful block.",
      });
    }
  }
  const sum = (key: "inputTokens" | "outputTokens" | "estimatedCostMicros") =>
    unknownUsage || reviews.some((r) => r[key] === null)
      ? null
      : reviews.reduce((total, r) => total + r[key]!, 0);
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    label,
    datasetVersion,
    promptVersion: proofPromptVersion,
    mode,
    models: [...new Set(reviews.map((r) => r.model))],
    cases,
    passed: cases.filter((c) => c.passed).length,
    total: cases.length,
    modelCalls,
    durationMs: Date.now() - started,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    estimatedCostMicros: sum("estimatedCostMicros"),
  };
}
