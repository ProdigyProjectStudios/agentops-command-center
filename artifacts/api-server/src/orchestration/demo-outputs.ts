import type { OperationalRequest } from "@workspace/db";
import type { RiskLevel } from "./types";

export interface ScenarioFingerprint {
  costCents: number;
  riskLevel: RiskLevel;
  routedAgents: string[];
  category: string;
  rationale: string;
}

const KEYWORD_RISK: Array<{ words: string[]; risk: RiskLevel; cost: number }> =
  [
    {
      words: ["lay off", "layoff", "termination", "firing"],
      risk: "critical",
      cost: 0,
    },
    { words: ["acquisition", "merger", "m&a"], risk: "high", cost: 25_000_00 },
    { words: ["legal", "lawsuit", "lawyer"], risk: "high", cost: 18_000_00 },
    {
      words: ["roofing", "contractor", "facilities", "repair"],
      risk: "low",
      cost: 48_000_00,
    },
    {
      words: ["marketing", "campaign", "ad spend"],
      risk: "medium",
      cost: 35_000_00,
    },
    { words: ["hire", "hiring", "recruit"], risk: "medium", cost: 12_000_00 },
    {
      words: ["software", "saas", "tool", "license"],
      risk: "low",
      cost: 8_400_00,
    },
  ];

export function fingerprintRequest(
  request: OperationalRequest,
): ScenarioFingerprint {
  const text = `${request.title} ${request.description}`.toLowerCase();
  const match = KEYWORD_RISK.find((k) => k.words.some((w) => text.includes(w)));
  // Priority changes urgency, never the monetary amount supplied by the operator.
  const amountPattern = /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/gi;
  const amounts = (value: string) =>
    [...value.matchAll(amountPattern)]
      .map((m) =>
        Math.round(
          Number(m[1].replaceAll(",", "")) *
            (m[2]?.toLowerCase() === "k"
              ? 1000
              : m[2]?.toLowerCase() === "m"
                ? 1000000
                : 1) *
            100,
        ),
      )
      .filter((n) => Number.isSafeInteger(n) && n >= 0);
  // The request title identifies the requested spend; descriptions can also quote policy thresholds.
  const explicit = [...new Set(amounts(request.title))];
  const descriptionAmounts = [...new Set(amounts(request.description))];
  const supplied =
    explicit.length === 1
      ? explicit[0]
      : explicit.length === 0 && descriptionAmounts.length === 1
        ? descriptionAmounts[0]
        : undefined;
  const cost = supplied ?? match?.cost ?? 9_500_00;
  const risk = match?.risk ?? "medium";
  const routedAgents =
    risk === "critical" || risk === "high"
      ? ["legal-counsel", "finance-analyst", "communications", "memory"]
      : ["legal-counsel", "finance-analyst", "communications", "memory"];
  return {
    costCents: cost,
    riskLevel: risk,
    routedAgents,
    category: match?.words[0] ?? "general-ops",
    rationale: match
      ? `Matched scenario keyword "${match.words[0]}" — applying ${risk} risk profile. ${supplied !== undefined ? "Spend copied from the request." : "Spend is a scenario estimate; confirm it with the operator."}`
      : "No scenario keyword matched — applying default medium-risk operational profile.",
  };
}

export function opsTriageDemo(
  request: OperationalRequest,
  fp: ScenarioFingerprint,
): Record<string, unknown> {
  return {
    classification: fp.category,
    department: request.department,
    routedAgents: fp.routedAgents,
    estimatedCostCents: fp.costCents,
    initialRiskLevel: fp.riskLevel,
    rationale: fp.rationale,
    nextStage: "memory_grounding",
    keywordsExtracted: extractKeywords(request),
  };
}

export function memoryLookupDemo(
  request: OperationalRequest,
  fp: ScenarioFingerprint,
): Record<string, unknown> {
  const keywords = extractKeywords(request);
  return {
    citedDocuments: [
      {
        title: "Vendor Onboarding Policy v3.2",
        category: "Procurement",
        relevance: 0.94,
      },
      {
        title: "Portfolio Operating Standards",
        category: "Governance",
        relevance: 0.87,
      },
      {
        title: `${capitalize(fp.category)} Workflow Playbook`,
        category: "Playbook",
        relevance: 0.81,
      },
    ],
    relevantPolicies: [
      "All vendor engagements above $25K require COI on file.",
      "Department heads must approve spend within their allocated quarterly budget.",
      "Communications touching tenant or staff populations require 48h notice.",
    ],
    semanticMatches: keywords.length,
    summary: `Surfaced 3 highly relevant policies and ${keywords.length} semantic matches from the knowledge base.`,
  };
}

export function legalReviewDemo(
  request: OperationalRequest,
  fp: ScenarioFingerprint,
): Record<string, unknown> {
  const isHighRisk = fp.riskLevel === "high" || fp.riskLevel === "critical";
  return {
    complianceChecks: [
      { name: "Vendor license verification", status: "pass" },
      {
        name: "Certificate of Insurance on file",
        status: isHighRisk ? "review" : "pass",
      },
      { name: "Sanctions / OFAC screen", status: "pass" },
      {
        name: "Indemnification clause review",
        status: isHighRisk ? "flag" : "pass",
      },
    ],
    flaggedClauses: isHighRisk
      ? [
          "Limitation of liability cap is set at 1× contract value — recommend negotiating to 2×.",
          "Auto-renewal language requires 90-day notice — propose 30-day cancellation right.",
        ]
      : [],
    recommendation: isHighRisk
      ? "Conditional approve pending insurance certificate refresh and indemnification redline."
      : "Approve — no material legal blockers identified.",
    riskAssessment: fp.riskLevel,
    confidence: isHighRisk ? "0.78" : "0.93",
  };
}

export function financeReviewDemo(
  request: OperationalRequest,
  fp: ScenarioFingerprint,
): Record<string, unknown> {
  const quarterlyBudget = 120_000_00;
  const utilization = Math.min(0.99, fp.costCents / quarterlyBudget);
  return {
    budgetCheck: {
      requestedCents: fp.costCents,
      quarterlyBudgetCents: quarterlyBudget,
      utilizationPct: Math.round(utilization * 100),
      passes: utilization < 0.85,
    },
    forecast: {
      twelveMonthImpactCents: fp.costCents * 1.15,
      paybackPeriodMonths: fp.costCents > 30_000_00 ? 14 : 6,
      irr: fp.riskLevel === "low" ? "0.22" : "0.11",
    },
    recommendation:
      utilization < 0.85
        ? `Approve. Spend lands at ${Math.round(utilization * 100)}% of ${
            request.department
          } quarterly budget.`
        : "Defer. Spend would push the department past 85% budget utilization for the quarter.",
    cashflowImpact:
      "Neutral within current quarter; absorbed via existing OpEx line.",
    confidence: "0.88",
  };
}

export function communicationsDemo(
  request: OperationalRequest,
  fp: ScenarioFingerprint,
): Record<string, unknown> {
  return {
    internalMemo: `Subject: ${request.title}\n\nTeam,\n\nWe are moving forward with the ${fp.category} initiative described in operational request #${request.id}. Estimated investment is $${(fp.costCents / 100).toLocaleString()}, with all compliance and budget checks completed by the AgentOps platform. Expect kickoff within 5 business days. Reach out to ${request.requestedBy} with questions.\n\n— AgentOps Communications`,
    externalAnnouncement:
      fp.riskLevel === "low"
        ? "No external announcement required."
        : `Stakeholder note: A ${fp.category} engagement has been authorized for the ${request.department} workstream pending final sign-off.`,
    distributionList: [
      `${request.department} leadership`,
      "Portfolio operations",
      "Compliance",
    ],
    tone: fp.riskLevel === "critical" ? "measured" : "confident",
    confidence: "0.91",
  };
}

export function synthesisDemo(
  request: OperationalRequest,
  fp: ScenarioFingerprint,
): Record<string, unknown> {
  const isConditional = fp.riskLevel === "high";
  const isReject = fp.riskLevel === "critical";
  const recommendedDecision = isReject
    ? "reject"
    : isConditional
      ? "conditional_approve"
      : "approve";
  const blockingIssues = isConditional
    ? [
        "Insurance certificate refresh required before contract execution.",
        "Indemnification clause must be redlined to 2× contract value cap.",
      ]
    : [];
  return {
    overallRisk: fp.riskLevel,
    blockingIssues,
    recommendedDecision,
    keyEvidence: [
      "Legal review cleared (with conditions on insurance for higher-risk engagements).",
      "Finance review confirmed spend fits within quarterly envelope.",
      "Communications package drafted and ready for distribution.",
      "Memory agent surfaced 3 policy citations with strong semantic match.",
    ],
    nextActions: [
      `Notify ${request.requestedBy} of pending operator approval`,
      "Park drafted comms in queue pending decision",
      "Re-trigger workflow if any input changes within 24h",
    ],
    summary: `${capitalize(fp.category)} request scoped at $${(fp.costCents / 100).toLocaleString()} with ${fp.riskLevel} overall risk. All four downstream agents reported pass/conditional-pass. Routing to operator approval.`,
    confidence: "0.9",
  };
}

function extractKeywords(req: OperationalRequest): string[] {
  const text = `${req.title} ${req.description}`.toLowerCase();
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "are",
    "was",
    "have",
    "has",
    "will",
    "would",
    "our",
    "your",
    "their",
    "you",
    "they",
    "them",
    "what",
    "when",
    "where",
    "which",
  ]);
  const words = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  return Array.from(new Set(words)).slice(0, 8);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
