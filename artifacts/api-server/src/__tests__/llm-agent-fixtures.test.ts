import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { ZodTypeAny } from "zod";

process.env["OPENAI_API_KEY"] = "test-key";
delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

let nextResponse: { content: string | null } = { content: "{}" };

class FakeOpenAI {
  constructor(_opts: unknown) {}
  chat = {
    completions: {
      create: async (_req: unknown, _opts?: unknown) => ({
        choices: [{ message: { content: nextResponse.content } }],
      }),
    },
  };
}

mock.module("openai", { defaultExport: FakeOpenAI });

const { generateAgentOutput } = await import("../lib/llm.js");
const {
  opsTriageSchema,
  memoryLookupSchema,
  legalReviewSchema,
  financeReviewSchema,
  communicationsSchema,
  synthesisSchema,
} = await import("../orchestration/schemas.js");

beforeEach(() => {
  nextResponse = { content: "{}" };
});

interface AgentFixture {
  name: string;
  agentSlug: string;
  schema: ZodTypeAny;
  demoFallback: Record<string, unknown>;
  /** A realistic "almost valid" payload — a field is missing or partial. */
  partialPayload: Record<string, unknown>;
  /** Assertions about the merged result for the partial payload. */
  expectMerged: (out: Record<string, unknown>) => void;
  /**
   * A payload that is "almost right" but breaks validation (wrong enum,
   * stringified number, malformed nested shape). The orchestrator should
   * fall back to the demo output rather than propagate garbage.
   */
  brokenPayload: Record<string, unknown>;
}

const opsTriageDemo = {
  classification: "roofing",
  department: "Facilities",
  routedAgents: ["legal-counsel", "finance-analyst", "communications", "memory"],
  estimatedCostCents: 48_000_00,
  initialRiskLevel: "low",
  rationale: 'Matched scenario keyword "roofing" — applying low risk profile.',
  nextStage: "memory_grounding",
  keywordsExtracted: ["roof", "repair", "vendor"],
};

const memoryLookupDemo = {
  citedDocuments: [
    { title: "Vendor Onboarding Policy v3.2", category: "Procurement", relevance: 0.94 },
    { title: "Portfolio Operating Standards", category: "Governance", relevance: 0.87 },
  ],
  relevantPolicies: ["All vendor engagements above $25K require COI on file."],
  semanticMatches: 3,
  summary: "Surfaced 2 highly relevant policies and 3 semantic matches.",
};

const legalReviewDemo = {
  complianceChecks: [
    { name: "Vendor license verification", status: "pass" },
    { name: "Certificate of Insurance on file", status: "pass" },
    { name: "Sanctions / OFAC screen", status: "pass" },
    { name: "Indemnification clause review", status: "pass" },
  ],
  flaggedClauses: [],
  recommendation: "Approve — no material legal blockers identified.",
  riskAssessment: "low",
  confidence: "0.93",
};

const financeReviewDemo = {
  budgetCheck: {
    requestedCents: 48_000_00,
    quarterlyBudgetCents: 120_000_00,
    utilizationPct: 40,
    passes: true,
  },
  forecast: {
    twelveMonthImpactCents: 55_200_00,
    paybackPeriodMonths: 6,
    irr: "0.22",
  },
  recommendation: "Approve. Spend lands at 40% of Facilities quarterly budget.",
  cashflowImpact: "Neutral within current quarter.",
  confidence: "0.88",
};

const communicationsDemo = {
  internalMemo: "Subject: roof repair\n\nTeam, we are proceeding...",
  externalAnnouncement: "No external announcement required.",
  distributionList: ["Facilities leadership", "Portfolio operations", "Compliance"],
  tone: "confident",
  confidence: "0.91",
};

const synthesisDemo = {
  overallRisk: "low",
  blockingIssues: [],
  recommendedDecision: "approve",
  keyEvidence: ["Legal review cleared.", "Finance review confirmed spend."],
  nextActions: ["Notify requester", "Park drafted comms"],
  summary: "Roofing request scoped at $48,000 with low overall risk.",
  confidence: "0.9",
};

const fixtures: AgentFixture[] = [
  {
    name: "ops-triage",
    agentSlug: "ops-triage",
    schema: opsTriageSchema,
    demoFallback: opsTriageDemo,
    // Realistic partial: model only returned the high-level classification +
    // a tweaked cost; everything else should fall back from demo.
    partialPayload: {
      classification: "facilities-roofing",
      estimatedCostCents: 51_500_00,
      keywordsExtracted: ["roof", "leak", "contractor"],
    },
    expectMerged: (out) => {
      assert.equal(out["classification"], "facilities-roofing");
      assert.equal(out["estimatedCostCents"], 51_500_00);
      assert.deepEqual(out["keywordsExtracted"], ["roof", "leak", "contractor"]);
      // backfilled from demo:
      assert.equal(out["department"], "Facilities");
      assert.equal(out["initialRiskLevel"], "low");
      assert.equal(out["nextStage"], "memory_grounding");
      assert.deepEqual(out["routedAgents"], opsTriageDemo.routedAgents);
    },
    // Broken: invalid enum for initialRiskLevel + stringified number.
    brokenPayload: {
      classification: "roofing",
      department: "Facilities",
      routedAgents: ["legal-counsel"],
      estimatedCostCents: "48000",
      initialRiskLevel: "severe",
      rationale: "x",
      nextStage: "memory_grounding",
      keywordsExtracted: ["roof"],
    },
  },
  {
    name: "memory-lookup",
    agentSlug: "memory",
    schema: memoryLookupSchema,
    demoFallback: memoryLookupDemo,
    // Partial: model returned new policies + summary but omitted citations.
    partialPayload: {
      relevantPolicies: [
        "Vendors above $25K require COI.",
        "Department heads must approve quarterly spend.",
      ],
      summary: "Found 2 controlling policies for the request.",
    },
    expectMerged: (out) => {
      assert.deepEqual(out["relevantPolicies"], [
        "Vendors above $25K require COI.",
        "Department heads must approve quarterly spend.",
      ]);
      assert.equal(out["summary"], "Found 2 controlling policies for the request.");
      // backfilled:
      assert.deepEqual(out["citedDocuments"], memoryLookupDemo.citedDocuments);
      assert.equal(out["semanticMatches"], 3);
    },
    // Broken: a cited document is missing required `relevance` AND has it as a
    // string, plus semanticMatches stringified.
    brokenPayload: {
      citedDocuments: [
        { title: "Some doc", category: "Procurement", relevance: "high" },
      ],
      relevantPolicies: ["x"],
      semanticMatches: "many",
      summary: "ok",
    },
  },
  {
    name: "legal-review",
    agentSlug: "legal-counsel",
    schema: legalReviewSchema,
    demoFallback: legalReviewDemo,
    // Partial: model returned new compliance checks + recommendation but
    // omitted the riskAssessment + confidence.
    partialPayload: {
      complianceChecks: [
        { name: "Vendor license verification", status: "pass" },
        { name: "Insurance on file", status: "review" },
      ],
      flaggedClauses: ["Limitation of liability cap is too low."],
      recommendation: "Conditional approve pending insurance refresh.",
    },
    expectMerged: (out) => {
      assert.deepEqual(out["complianceChecks"], [
        { name: "Vendor license verification", status: "pass" },
        { name: "Insurance on file", status: "review" },
      ]);
      assert.deepEqual(out["flaggedClauses"], [
        "Limitation of liability cap is too low.",
      ]);
      assert.equal(
        out["recommendation"],
        "Conditional approve pending insurance refresh.",
      );
      // backfilled from demo:
      assert.equal(out["riskAssessment"], "low");
      assert.equal(out["confidence"], "0.93");
    },
    // Broken: status uses an unsupported enum value ("warn"), plus a
    // missing-name check entry.
    brokenPayload: {
      complianceChecks: [
        { name: "license", status: "warn" },
        { status: "pass" },
      ],
      flaggedClauses: [],
      recommendation: "ok",
      riskAssessment: "low",
      confidence: "0.9",
    },
  },
  {
    name: "finance-review",
    agentSlug: "finance-analyst",
    schema: financeReviewSchema,
    demoFallback: financeReviewDemo,
    // Partial: model returned a refined budgetCheck (but only some keys) and a
    // new recommendation. Forecast + cashflow should fall back from demo, and
    // the missing budgetCheck keys should be filled in too.
    partialPayload: {
      budgetCheck: {
        requestedCents: 52_000_00,
        utilizationPct: 43,
      },
      recommendation: "Approve — fits comfortably within Facilities envelope.",
    },
    expectMerged: (out) => {
      const budget = out["budgetCheck"] as Record<string, unknown>;
      assert.equal(budget["requestedCents"], 52_000_00);
      assert.equal(budget["utilizationPct"], 43);
      // missing keys backfilled from demo:
      assert.equal(budget["quarterlyBudgetCents"], 120_000_00);
      assert.equal(budget["passes"], true);
      assert.deepEqual(out["forecast"], financeReviewDemo.forecast);
      assert.equal(
        out["recommendation"],
        "Approve — fits comfortably within Facilities envelope.",
      );
      assert.equal(out["cashflowImpact"], financeReviewDemo.cashflowImpact);
      assert.equal(out["confidence"], "0.88");
    },
    // Broken: stringified number for requestedCents and a non-boolean `passes`.
    brokenPayload: {
      budgetCheck: {
        requestedCents: "48000",
        quarterlyBudgetCents: 120_000_00,
        utilizationPct: 40,
        passes: "yes",
      },
      forecast: {
        twelveMonthImpactCents: 55_200_00,
        paybackPeriodMonths: 6,
        irr: "0.22",
      },
      recommendation: "Approve.",
      cashflowImpact: "Neutral.",
      confidence: "0.88",
    },
  },
  {
    name: "communications",
    agentSlug: "communications",
    schema: communicationsSchema,
    demoFallback: communicationsDemo,
    // Partial: model returned a fresh memo + tone, but no announcement or
    // distribution list.
    partialPayload: {
      internalMemo: "Subject: Roof repair\n\nTeam, we are moving forward...",
      tone: "measured",
    },
    expectMerged: (out) => {
      assert.equal(
        out["internalMemo"],
        "Subject: Roof repair\n\nTeam, we are moving forward...",
      );
      assert.equal(out["tone"], "measured");
      assert.equal(
        out["externalAnnouncement"],
        communicationsDemo.externalAnnouncement,
      );
      assert.deepEqual(
        out["distributionList"],
        communicationsDemo.distributionList,
      );
      assert.equal(out["confidence"], "0.91");
    },
    // Broken: distributionList is a string instead of array — common LLM mistake.
    brokenPayload: {
      internalMemo: "memo",
      externalAnnouncement: "none",
      distributionList: "Facilities leadership; Portfolio operations",
      tone: "confident",
      confidence: "0.91",
    },
  },
  {
    name: "synthesis",
    agentSlug: "synthesis",
    schema: synthesisSchema,
    demoFallback: synthesisDemo,
    // Partial: model returned a flipped decision + new evidence, but omitted
    // overallRisk, summary, confidence — all should backfill from demo.
    partialPayload: {
      recommendedDecision: "conditional_approve",
      blockingIssues: ["Insurance certificate must be refreshed."],
      keyEvidence: [
        "Legal flagged the indemnification clause.",
        "Finance approved the spend envelope.",
      ],
      nextActions: ["Request updated COI from vendor"],
    },
    expectMerged: (out) => {
      assert.equal(out["recommendedDecision"], "conditional_approve");
      assert.deepEqual(out["blockingIssues"], [
        "Insurance certificate must be refreshed.",
      ]);
      assert.deepEqual(out["keyEvidence"], [
        "Legal flagged the indemnification clause.",
        "Finance approved the spend envelope.",
      ]);
      assert.deepEqual(out["nextActions"], [
        "Request updated COI from vendor",
      ]);
      // backfilled from demo:
      assert.equal(out["overallRisk"], "low");
      assert.equal(out["summary"], synthesisDemo.summary);
      assert.equal(out["confidence"], "0.9");
    },
    // Broken: recommendedDecision uses an unsupported enum value
    // ("approve_with_conditions") — a very plausible LLM near-miss.
    brokenPayload: {
      overallRisk: "low",
      blockingIssues: [],
      recommendedDecision: "approve_with_conditions",
      keyEvidence: ["x"],
      nextActions: ["y"],
      summary: "z",
      confidence: "0.9",
    },
  },
];

for (const fx of fixtures) {
  test(`[${fx.name}] partial-but-valid response is deep-merged onto demo`, async () => {
    nextResponse = { content: JSON.stringify(fx.partialPayload) };
    const out = await generateAgentOutput({
      agentSlug: fx.agentSlug,
      agentName: fx.name,
      systemPrompt: "system",
      userPrompt: "user",
      demoFallback: fx.demoFallback,
      schema: fx.schema,
    });
    fx.expectMerged(out.details);
    // Sanity: every key the demo defines should still be present after merge.
    for (const key of Object.keys(fx.demoFallback)) {
      assert.ok(
        key in out.details,
        `expected merged result to contain key "${key}"`,
      );
    }
    assert.equal(out.fallback, undefined);
  });

  test(`[${fx.name}] almost-right-but-invalid response falls back to demo`, async () => {
    nextResponse = { content: JSON.stringify(fx.brokenPayload) };
    const out = await generateAgentOutput({
      agentSlug: fx.agentSlug,
      agentName: fx.name,
      systemPrompt: "system",
      userPrompt: "user",
      demoFallback: fx.demoFallback,
      schema: fx.schema,
    });
    assert.deepEqual(out.details, fx.demoFallback);
    assert.equal(out.fallback?.mode, "live");
    assert.equal(out.fallback?.reason, "schema_validation");
  });
}
