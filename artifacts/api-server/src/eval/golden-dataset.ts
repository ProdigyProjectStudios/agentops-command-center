/**
 * Golden dataset for the AgentOps deterministic eval harness.
 *
 * Each scenario supplies a synthetic request whose title/description
 * deterministically triggers a specific `fingerprintRequest()` keyword match,
 * and explicit behavioral expectations for every specialist agent.
 *
 * All request keyword matches are verified against the KEYWORD_RISK table in
 * demo-outputs.ts. Each scenario uses priority "low" so no priority cost-boost
 * is applied, keeping expected cost values exact.
 *
 * NOTE — unreachable branch (documented):
 *   `financeReviewDemo` produces `budgetCheck.passes === false` only when
 *   utilization ≥ 0.85, i.e. costCents ≥ 10,200,000¢ against the hardcoded
 *   quarterly budget of 12,000,000¢. The maximum cost reachable through the
 *   public KEYWORD_RISK table is 4,800,000¢ ("roofing"), and the maximum
 *   priority boost is 1,200,000¢ ("urgent"), giving a ceiling of 6,000,000¢
 *   (50% utilisation). The `passes === false` branch is therefore unreachable
 *   through the existing deterministic request/demo path without modifying
 *   production constants. All four scenarios assert `budgetPasses: true`.
 */

/** Minimal fields used by fingerprintRequest() and the *Demo() functions. */
export interface ScenarioRequest {
  id: number;
  title: string;
  description: string;
  department: string;
  priority: string;
  requestedBy: string;
  portfolioCompanyId: number;
}

export interface FingerprintExpectation {
  /** Expected risk level from KEYWORD_RISK keyword match. */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Expected base cost in cents (priority="low" → no boost). */
  expectedCostCents: number;
}

export interface TriageExpectation {
  initialRiskLevel: "low" | "medium" | "high" | "critical";
  /** Minimum acceptable envelope confidence (floor, not exact). */
  minConfidence: number;
}

export interface LegalExpectation {
  riskAssessment: "low" | "medium" | "high" | "critical";
  /** "empty" → flaggedClauses must be []; "non-empty" → length must be > 0. */
  flaggedClausesCondition: "empty" | "non-empty";
  /** Whether every complianceCheck entry should have status "pass". */
  allChecksPass: boolean;
  minConfidence: number;
}

export interface FinanceExpectation {
  /** Whether budgetCheck.passes should be true (see unreachable-branch note). */
  budgetPasses: boolean;
  /** Expected forecast.paybackPeriodMonths (6 if cost ≤ 3,000,000¢; else 14). */
  paybackPeriodMonths: number;
  minConfidence: number;
}

export interface CommunicationsExpectation {
  tone: string;
  /** internalMemo must be longer than this character count. */
  minMemoLength: number;
  minConfidence: number;
}

export interface SynthesisExpectation {
  recommendedDecision: "approve" | "conditional_approve" | "reject";
  minConfidence: number;
}

export interface CrossAgentExpectation {
  /**
   * triage.initialRiskLevel, legal.riskAssessment, and synthesis.overallRisk
   * must all equal this value — they each receive the same fingerprint.
   */
  riskConsistent: "low" | "medium" | "high" | "critical";
  /**
   * Whether legal.flaggedClauses should be non-empty.
   * True for high and critical risk (isHighRisk covers both).
   */
  legalFlaggedNonEmpty: boolean;
  /**
   * synthesis.recommendedDecision must be consistent with risk level:
   *   critical → reject
   *   high     → conditional_approve
   *   medium   → approve
   *   low      → approve
   */
  synthesisDecision: "approve" | "conditional_approve" | "reject";
}

export interface GoldenExpectations {
  fingerprint: FingerprintExpectation;
  triage: TriageExpectation;
  legal: LegalExpectation;
  finance: FinanceExpectation;
  communications: CommunicationsExpectation;
  synthesis: SynthesisExpectation;
  crossAgent: CrossAgentExpectation;
}

export interface GoldenScenario {
  id: string;
  description: string;
  request: ScenarioRequest;
  expectations: GoldenExpectations;
}

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    id: "saas-tool-low-risk",
    description:
      'SaaS/software license renewal — triggers "saas" keyword (low risk, approve path)',
    request: {
      id: 1,
      title: "SaaS License Renewal",
      description:
        "Renewing the annual saas subscription for our project management tool.",
      department: "Engineering",
      priority: "low",
      requestedBy: "alice@example.com",
      portfolioCompanyId: 1,
    },
    expectations: {
      // "saas" matches KEYWORD_RISK entry: risk=low, cost=840,000¢
      fingerprint: { riskLevel: "low", expectedCostCents: 840_000 },
      triage: { initialRiskLevel: "low", minConfidence: 0.9 },
      legal: {
        riskAssessment: "low",
        flaggedClausesCondition: "empty",
        allChecksPass: true,
        minConfidence: 0.7,
      },
      // utilization = 840,000 / 12,000,000 = 7% → passes; cost < 3,000,000 → payback 6m
      finance: { budgetPasses: true, paybackPeriodMonths: 6, minConfidence: 0.8 },
      communications: { tone: "confident", minMemoLength: 50, minConfidence: 0.8 },
      synthesis: { recommendedDecision: "approve", minConfidence: 0.8 },
      crossAgent: {
        riskConsistent: "low",
        legalFlaggedNonEmpty: false,
        synthesisDecision: "approve",
      },
    },
  },

  {
    id: "acquisition-high-risk",
    description:
      'M&A acquisition — triggers "acquisition" keyword (high risk, conditional_approve path)',
    request: {
      id: 2,
      title: "Portfolio Company Acquisition",
      description: "Evaluating a potential acquisition of a competitor company.",
      department: "Corporate Development",
      priority: "low",
      requestedBy: "bob@example.com",
      portfolioCompanyId: 1,
    },
    expectations: {
      // "acquisition" matches KEYWORD_RISK entry: risk=high, cost=2,500,000¢
      fingerprint: { riskLevel: "high", expectedCostCents: 2_500_000 },
      triage: { initialRiskLevel: "high", minConfidence: 0.9 },
      legal: {
        riskAssessment: "high",
        flaggedClausesCondition: "non-empty",
        allChecksPass: false, // high risk → "review" and "flag" statuses
        minConfidence: 0.7,
      },
      // utilization = 2,500,000 / 12,000,000 = 20.8% → passes; cost < 3,000,000 → payback 6m
      finance: { budgetPasses: true, paybackPeriodMonths: 6, minConfidence: 0.8 },
      communications: {
        tone: "confident", // high ≠ critical; only critical → "measured"
        minMemoLength: 50,
        minConfidence: 0.8,
      },
      synthesis: { recommendedDecision: "conditional_approve", minConfidence: 0.8 },
      crossAgent: {
        riskConsistent: "high",
        legalFlaggedNonEmpty: true,
        synthesisDecision: "conditional_approve",
      },
    },
  },

  {
    id: "layoff-critical-risk",
    description:
      'Workforce layoff — triggers "layoff" keyword (critical risk, reject path)',
    request: {
      id: 3,
      title: "Workforce Reduction",
      description:
        "Proposing a layoff of 15% of the workforce due to budget constraints.",
      department: "HR",
      priority: "low",
      requestedBy: "carol@example.com",
      portfolioCompanyId: 1,
    },
    expectations: {
      // "layoff" matches KEYWORD_RISK entry: risk=critical, cost=0¢
      fingerprint: { riskLevel: "critical", expectedCostCents: 0 },
      triage: { initialRiskLevel: "critical", minConfidence: 0.9 },
      legal: {
        riskAssessment: "critical",
        flaggedClausesCondition: "non-empty", // isHighRisk covers critical
        allChecksPass: false,
        minConfidence: 0.7,
      },
      // utilization = 0 / 12,000,000 = 0% → passes; cost < 3,000,000 → payback 6m
      finance: { budgetPasses: true, paybackPeriodMonths: 6, minConfidence: 0.8 },
      communications: {
        tone: "measured", // only critical → "measured"
        minMemoLength: 50,
        minConfidence: 0.8,
      },
      synthesis: { recommendedDecision: "reject", minConfidence: 0.8 },
      crossAgent: {
        riskConsistent: "critical",
        legalFlaggedNonEmpty: true,
        synthesisDecision: "reject",
      },
    },
  },

  {
    id: "marketing-medium-risk",
    description:
      'Marketing campaign — triggers "marketing" keyword (medium risk, approve path with long payback)',
    request: {
      id: 4,
      title: "Q3 Marketing Campaign",
      description:
        "Requesting approval for the Q3 marketing campaign spend.",
      department: "Marketing",
      priority: "low",
      requestedBy: "dave@example.com",
      portfolioCompanyId: 1,
    },
    expectations: {
      // "marketing" matches KEYWORD_RISK entry: risk=medium, cost=3,500,000¢
      fingerprint: { riskLevel: "medium", expectedCostCents: 3_500_000 },
      triage: { initialRiskLevel: "medium", minConfidence: 0.9 },
      legal: {
        riskAssessment: "medium",
        flaggedClausesCondition: "empty",
        allChecksPass: true,
        minConfidence: 0.7,
      },
      // utilization = 3,500,000 / 12,000,000 = 29.2% → passes; cost > 3,000,000 → payback 14m
      finance: { budgetPasses: true, paybackPeriodMonths: 14, minConfidence: 0.8 },
      communications: { tone: "confident", minMemoLength: 50, minConfidence: 0.8 },
      synthesis: { recommendedDecision: "approve", minConfidence: 0.8 },
      crossAgent: {
        riskConsistent: "medium",
        legalFlaggedNonEmpty: false,
        synthesisDecision: "approve",
      },
    },
  },
];
