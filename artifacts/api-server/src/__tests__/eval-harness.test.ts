/**
 * AgentOps deterministic eval harness.
 *
 * Tests behavioral decisions of the four specialist demo paths using the
 * public exported functions from demo-outputs.ts and schemas.ts.
 * No database, no server, no OpenAI API key, no mock.module required —
 * all tested functions are pure.
 *
 * Run in isolation:
 *   pnpm --filter @workspace/api-server eval
 *
 * Included in the full suite:
 *   pnpm --filter @workspace/api-server test
 *
 * Each scenario:
 *   1. Calls fingerprintRequest() and asserts keyword→risk mapping.
 *   2. Calls each *Demo() function and validates the specialist Zod schema.
 *   3. Validates a synthetic AgentOutput envelope via agentOutputSchema.
 *   4. Asserts explicit behavioral golden values.
 *   5. Asserts cross-agent decision consistency within the scenario.
 *   6. Asserts confidence floors (not exact values).
 *   7. Asserts output quality invariants (non-empty strings, content length).
 *
 * The test DOES NOT claim to prove the full DB-backed orchestration engine ran.
 * It exercises the deterministic demo decision functions that engine.run()
 * delegates to under demo mode.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { OperationalRequest } from "@workspace/db";

import {
  GOLDEN_SCENARIOS,
  type GoldenScenario,
} from "../eval/golden-dataset.js";
import { buildReport, writeReport, printSummary, COVERAGE_GAPS, type CheckResult } from "../eval/reporter.js";
import {
  fingerprintRequest,
  opsTriageDemo,
  memoryLookupDemo,
  legalReviewDemo,
  financeReviewDemo,
  communicationsDemo,
  synthesisDemo,
} from "../orchestration/demo-outputs.js";
import {
  opsTriageSchema,
  memoryLookupSchema,
  legalReviewSchema,
  financeReviewSchema,
  communicationsSchema,
  synthesisSchema,
} from "../orchestration/schemas.js";
import { agentOutputSchema, parseConfidence } from "../lib/agents/types.js";

// ─── Check collector ──────────────────────────────────────────────────────────

/** All check results across every scenario — written to the report via after(). */
const ALL_CHECKS: CheckResult[] = [];

/**
 * Record one check result. Does NOT throw — failures are collected and the
 * test asserts zero failures at the end, so all checks within a scenario run
 * even when one fails.
 */
function record(
  scenario: string,
  agent: string,
  checkName: string,
  condition: boolean,
  opts?: { expected?: unknown; actual?: unknown; note?: string },
): void {
  ALL_CHECKS.push({
    scenario,
    agent: agent,
    check: checkName,
    passed: condition,
    expected: opts?.expected,
    actual: opts?.actual,
    note: opts?.note,
  });
}

// ─── Envelope helper ──────────────────────────────────────────────────────────

/**
 * Build a minimal valid AgentOutput envelope wrapping specialist details,
 * using a fixed confidence from the specialist's `confidence` string field.
 * This checks that the demo details can be embedded in a valid envelope.
 */
function makeEnvelope(details: Record<string, unknown>): unknown {
  const rawConf = details["confidence"];
  const confidence = parseConfidence(rawConf, 0.9);
  return {
    summary: "eval-harness synthetic summary",
    findings: ["eval-harness finding"],
    risks: [],
    recommendedActions: [],
    toolCallsRequested: [],
    confidence,
    details,
  };
}

// ─── Per-scenario runner ──────────────────────────────────────────────────────

function runScenario(scenario: GoldenScenario): void {
  const { id, request: raw, expectations: ex } = scenario;
  // Cast to OperationalRequest — same pattern as `runAgent` in base-agent.ts.
  const request = raw as unknown as OperationalRequest;
  const sid = id;

  // ── 1. Fingerprint ──────────────────────────────────────────────────────────
  const fp = fingerprintRequest(request);

  record(sid, "fingerprint", "riskLevel matches expected keyword class", fp.riskLevel === ex.fingerprint.riskLevel, {
    expected: ex.fingerprint.riskLevel,
    actual: fp.riskLevel,
  });
  record(sid, "fingerprint", "costCents equals expected keyword base cost", fp.costCents === ex.fingerprint.expectedCostCents, {
    expected: ex.fingerprint.expectedCostCents,
    actual: fp.costCents,
  });

  // ── 2. Ops Triage ──────────────────────────────────────────────────────────
  const triageDetails = opsTriageDemo(request, fp);
  const trSchemaResult = opsTriageSchema.safeParse(triageDetails);
  record(sid, "ops-triage", "specialist schema valid", trSchemaResult.success, {
    actual: trSchemaResult.success ? "pass" : trSchemaResult.error?.message,
  });

  const triageEnvResult = agentOutputSchema.safeParse(makeEnvelope(triageDetails));
  record(sid, "ops-triage", "AgentOutput envelope valid", triageEnvResult.success);

  record(sid, "ops-triage", "initialRiskLevel matches expected", triageDetails["initialRiskLevel"] === ex.triage.initialRiskLevel, {
    expected: ex.triage.initialRiskLevel,
    actual: triageDetails["initialRiskLevel"],
  });

  const triageFindings = triageDetails["findings"] as string[] | undefined;
  record(sid, "ops-triage", "routedAgents non-empty", Array.isArray(triageDetails["routedAgents"]) && (triageDetails["routedAgents"] as string[]).length > 0);

  // ── 3. Memory Lookup ────────────────────────────────────────────────────────
  const memDetails = memoryLookupDemo(request, fp);
  const memSchemaResult = memoryLookupSchema.safeParse(memDetails);
  record(sid, "memory-lookup", "specialist schema valid", memSchemaResult.success, {
    actual: memSchemaResult.success ? "pass" : memSchemaResult.error?.message,
  });

  const memEnvResult = agentOutputSchema.safeParse(makeEnvelope(memDetails));
  record(sid, "memory-lookup", "AgentOutput envelope valid", memEnvResult.success);

  const citedDocs = memDetails["citedDocuments"] as unknown[] | undefined;
  record(sid, "memory-lookup", "citedDocuments non-empty", Array.isArray(citedDocs) && citedDocs.length > 0);

  const relevantPolicies = memDetails["relevantPolicies"] as string[] | undefined;
  record(sid, "memory-lookup", "relevantPolicies non-empty", Array.isArray(relevantPolicies) && relevantPolicies.length > 0);

  // ── 4. Legal Review ─────────────────────────────────────────────────────────
  const legalDetails = legalReviewDemo(request, fp);
  const lgSchemaResult = legalReviewSchema.safeParse(legalDetails);
  record(sid, "legal-review", "specialist schema valid", lgSchemaResult.success, {
    actual: lgSchemaResult.success ? "pass" : lgSchemaResult.error?.message,
  });

  const legalEnvResult = agentOutputSchema.safeParse(makeEnvelope(legalDetails));
  record(sid, "legal-review", "AgentOutput envelope valid", legalEnvResult.success);

  record(sid, "legal-review", "riskAssessment matches expected", legalDetails["riskAssessment"] === ex.legal.riskAssessment, {
    expected: ex.legal.riskAssessment,
    actual: legalDetails["riskAssessment"],
  });

  const flaggedClauses = legalDetails["flaggedClauses"] as string[] | undefined;
  const flaggedIsEmpty = Array.isArray(flaggedClauses) && flaggedClauses.length === 0;
  const flaggedIsNonEmpty = Array.isArray(flaggedClauses) && flaggedClauses.length > 0;
  if (ex.legal.flaggedClausesCondition === "empty") {
    record(sid, "legal-review", "flaggedClauses is empty (low/medium risk)", flaggedIsEmpty, {
      expected: "[]",
      actual: JSON.stringify(flaggedClauses),
    });
  } else {
    record(sid, "legal-review", "flaggedClauses non-empty (high/critical risk)", flaggedIsNonEmpty, {
      expected: "length > 0",
      actual: flaggedClauses?.length,
    });
  }

  const checks = legalDetails["complianceChecks"] as Array<{ name: string; status: string }> | undefined;
  if (ex.legal.allChecksPass) {
    const allPass = Array.isArray(checks) && checks.every((c) => c.status === "pass");
    record(sid, "legal-review", "all complianceChecks status=pass (low/medium risk)", allPass, {
      actual: checks?.map((c) => c.status),
    });
  } else {
    const hasNonPass = Array.isArray(checks) && checks.some((c) => c.status !== "pass");
    record(sid, "legal-review", "complianceChecks has review/flag entry (high/critical risk)", hasNonPass, {
      actual: checks?.map((c) => c.status),
    });
  }

  const legalConf = parseConfidence(legalDetails["confidence"], 0);
  record(sid, "legal-review", `confidence ≥ ${ex.legal.minConfidence}`, legalConf >= ex.legal.minConfidence, {
    expected: `>= ${ex.legal.minConfidence}`,
    actual: legalConf,
  });

  // ── 5. Finance Review ───────────────────────────────────────────────────────
  const finDetails = financeReviewDemo(request, fp);
  const finSchemaResult = financeReviewSchema.safeParse(finDetails);
  record(sid, "finance-review", "specialist schema valid", finSchemaResult.success, {
    actual: finSchemaResult.success ? "pass" : finSchemaResult.error?.message,
  });

  const finEnvResult = agentOutputSchema.safeParse(makeEnvelope(finDetails));
  record(sid, "finance-review", "AgentOutput envelope valid", finEnvResult.success);

  const budgetCheck = finDetails["budgetCheck"] as { passes: boolean; utilizationPct: number } | undefined;
  record(sid, "finance-review", "budgetCheck.passes matches expected", budgetCheck?.passes === ex.finance.budgetPasses, {
    expected: ex.finance.budgetPasses,
    actual: budgetCheck?.passes,
    note: ex.finance.budgetPasses ? "passes=true: max reachable utilisation is 50% (below 85% threshold)" : undefined,
  });

  const forecast = finDetails["forecast"] as { paybackPeriodMonths: number } | undefined;
  record(sid, "finance-review", "forecast.paybackPeriodMonths matches expected", forecast?.paybackPeriodMonths === ex.finance.paybackPeriodMonths, {
    expected: ex.finance.paybackPeriodMonths,
    actual: forecast?.paybackPeriodMonths,
  });

  const finConf = parseConfidence(finDetails["confidence"], 0);
  record(sid, "finance-review", `confidence ≥ ${ex.finance.minConfidence}`, finConf >= ex.finance.minConfidence, {
    expected: `>= ${ex.finance.minConfidence}`,
    actual: finConf,
  });

  // ── 6. Communications ───────────────────────────────────────────────────────
  const commsDetails = communicationsDemo(request, fp);
  const comSchemaResult = communicationsSchema.safeParse(commsDetails);
  record(sid, "communications", "specialist schema valid", comSchemaResult.success, {
    actual: comSchemaResult.success ? "pass" : comSchemaResult.error?.message,
  });

  const commsEnvResult = agentOutputSchema.safeParse(makeEnvelope(commsDetails));
  record(sid, "communications", "AgentOutput envelope valid", commsEnvResult.success);

  record(sid, "communications", "tone matches expected", commsDetails["tone"] === ex.communications.tone, {
    expected: ex.communications.tone,
    actual: commsDetails["tone"],
  });

  const memo = commsDetails["internalMemo"] as string | undefined;
  record(sid, "communications", `internalMemo length > ${ex.communications.minMemoLength}`, typeof memo === "string" && memo.length > ex.communications.minMemoLength, {
    expected: `> ${ex.communications.minMemoLength} chars`,
    actual: typeof memo === "string" ? memo.length : "not a string",
  });

  const distList = commsDetails["distributionList"] as string[] | undefined;
  record(sid, "communications", "distributionList non-empty", Array.isArray(distList) && distList.length > 0);

  const commsConf = parseConfidence(commsDetails["confidence"], 0);
  record(sid, "communications", `confidence ≥ ${ex.communications.minConfidence}`, commsConf >= ex.communications.minConfidence, {
    expected: `>= ${ex.communications.minConfidence}`,
    actual: commsConf,
  });

  // ── 7. Synthesis ────────────────────────────────────────────────────────────
  const synthDetails = synthesisDemo(request, fp);
  const synSchemaResult = synthesisSchema.safeParse(synthDetails);
  record(sid, "synthesis", "specialist schema valid", synSchemaResult.success, {
    actual: synSchemaResult.success ? "pass" : synSchemaResult.error?.message,
  });

  const synthEnvResult = agentOutputSchema.safeParse(makeEnvelope(synthDetails));
  record(sid, "synthesis", "AgentOutput envelope valid", synthEnvResult.success);

  record(sid, "synthesis", "recommendedDecision matches expected", synthDetails["recommendedDecision"] === ex.synthesis.recommendedDecision, {
    expected: ex.synthesis.recommendedDecision,
    actual: synthDetails["recommendedDecision"],
  });

  const keyEvidence = synthDetails["keyEvidence"] as string[] | undefined;
  record(sid, "synthesis", "keyEvidence non-empty", Array.isArray(keyEvidence) && keyEvidence.length > 0);

  const nextActions = synthDetails["nextActions"] as string[] | undefined;
  record(sid, "synthesis", "nextActions non-empty", Array.isArray(nextActions) && nextActions.length > 0);

  const synthConf = parseConfidence(synthDetails["confidence"], 0);
  record(sid, "synthesis", `confidence ≥ ${ex.synthesis.minConfidence}`, synthConf >= ex.synthesis.minConfidence, {
    expected: `>= ${ex.synthesis.minConfidence}`,
    actual: synthConf,
  });

  // ── 8. Cross-agent consistency ──────────────────────────────────────────────
  // All three agents that expose a risk-level field receive the same fingerprint
  // and must agree.
  const triageRisk = triageDetails["initialRiskLevel"] as string;
  const legalRisk = legalDetails["riskAssessment"] as string;
  const synthRisk = synthDetails["overallRisk"] as string;
  const expectedRisk = ex.crossAgent.riskConsistent;

  record(sid, "cross-agent", "triage.initialRiskLevel === fingerprint.riskLevel", triageRisk === expectedRisk, {
    expected: expectedRisk,
    actual: triageRisk,
  });
  record(sid, "cross-agent", "legal.riskAssessment === fingerprint.riskLevel", legalRisk === expectedRisk, {
    expected: expectedRisk,
    actual: legalRisk,
  });
  record(sid, "cross-agent", "synthesis.overallRisk === fingerprint.riskLevel", synthRisk === expectedRisk, {
    expected: expectedRisk,
    actual: synthRisk,
  });

  // Legal flaggedClauses presence must be consistent with risk level.
  if (ex.crossAgent.legalFlaggedNonEmpty) {
    record(sid, "cross-agent", "high/critical risk → legal flaggedClauses non-empty", flaggedIsNonEmpty, {
      note: "isHighRisk=true covers both high and critical risk levels",
    });
  } else {
    record(sid, "cross-agent", "low/medium risk → legal flaggedClauses empty", flaggedIsEmpty, {
      note: "isHighRisk=false for low and medium risk levels",
    });
  }

  // Synthesis decision must be consistent with fingerprint risk level.
  record(sid, "cross-agent", "synthesis.recommendedDecision consistent with risk level", synthDetails["recommendedDecision"] === ex.crossAgent.synthesisDecision, {
    expected: ex.crossAgent.synthesisDecision,
    actual: synthDetails["recommendedDecision"],
    note: "critical→reject, high→conditional_approve, low/medium→approve",
  });

  // ── 9. Assert no failures (lets test runner report the scenario as pass/fail) ─
  const scenarioChecks = ALL_CHECKS.filter((c) => c.scenario === sid);
  const failures = scenarioChecks.filter((c) => !c.passed);
  if (failures.length > 0) {
    const msg = failures
      .map((f) => `[${f.agent}] ${f.check}${f.expected !== undefined ? ` (expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)})` : ""}`)
      .join("\n  ");
    assert.fail(`${failures.length} check(s) failed in scenario "${sid}":\n  ${msg}`);
  }
}

// ─── Test cases ───────────────────────────────────────────────────────────────

for (const scenario of GOLDEN_SCENARIOS) {
  test(`[eval] ${scenario.id}: ${scenario.description}`, () => {
    runScenario(scenario);
  });
}

// ─── Report ───────────────────────────────────────────────────────────────────

after(async () => {
  const report = buildReport(ALL_CHECKS);
  // Merge in coverage gaps that weren't exercised as failing checks.
  report.coverageGaps = COVERAGE_GAPS;
  let reportPath: string | undefined;
  try {
    reportPath = writeReport(report);
  } catch (err) {
    console.error("eval-harness: failed to write report:", err);
  }
  printSummary(report);
  if (reportPath) {
    console.log(`Report saved → ${reportPath}\n`);
  }
});
