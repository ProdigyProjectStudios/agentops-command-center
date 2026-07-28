import { z } from "zod";

const riskLevel = z.enum(["low", "medium", "high", "critical"]);
const checkStatus = z.enum(["pass", "review", "flag", "fail"]);
const recommendedDecision = z.enum([
  "approve",
  "conditional_approve",
  "reject",
]);

export const opsTriageSchema = z.object({
  classification: z.string(),
  department: z.string(),
  routedAgents: z.array(z.string()),
  estimatedCostCents: z.number(),
  initialRiskLevel: riskLevel,
  rationale: z.string(),
  nextStage: z.string(),
  keywordsExtracted: z.array(z.string()),
});

export const memoryLookupSchema = z.object({
  citedDocuments: z.array(
    z.object({
      title: z.string(),
      category: z.string(),
      relevance: z.number(),
    }),
  ),
  relevantPolicies: z.array(z.string()),
  semanticMatches: z.number(),
  summary: z.string(),
});

/**
 * Newer models (gpt-4.1+) sometimes return flaggedClauses as objects like
 * {clause, reason} instead of plain strings. Coerce either form to a string
 * so validation never hard-fails on a well-intentioned but over-structured
 * response.
 */
const flaggedClauseEntry = z.preprocess((val) => {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const v = val as Record<string, unknown>;
    return (
      v["clause"] ??
      v["text"] ??
      v["name"] ??
      v["description"] ??
      JSON.stringify(val)
    );
  }
  return String(val);
}, z.string());

export const legalReviewSchema = z.object({
  complianceChecks: z.array(
    z.object({
      name: z.string(),
      status: checkStatus,
    }),
  ),
  flaggedClauses: z.array(flaggedClauseEntry),
  recommendation: z.string(),
  riskAssessment: riskLevel,
  confidence: z.string(),
});

export const financeReviewSchema = z.object({
  budgetCheck: z.object({
    requestedCents: z.number(),
    quarterlyBudgetCents: z.number(),
    utilizationPct: z.number(),
    passes: z.boolean(),
  }),
  forecast: z.object({
    twelveMonthImpactCents: z.number(),
    paybackPeriodMonths: z.number(),
    irr: z.string(),
  }),
  recommendation: z.string(),
  cashflowImpact: z.string(),
  confidence: z.string(),
});

export const communicationsSchema = z.object({
  internalMemo: z.string(),
  externalAnnouncement: z.string(),
  distributionList: z.array(z.string()),
  tone: z.string(),
  confidence: z.string(),
});

export const synthesisSchema = z.object({
  overallRisk: riskLevel,
  blockingIssues: z.array(z.string()),
  recommendedDecision: recommendedDecision,
  keyEvidence: z.array(z.string()),
  nextActions: z.array(z.string()),
  summary: z.string(),
  confidence: z.string(),
});
