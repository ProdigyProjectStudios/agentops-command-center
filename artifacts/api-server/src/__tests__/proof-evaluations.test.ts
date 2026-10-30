import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateProof, citationsMatchInputs } from "../lib/proof-evaluations";
import { assessProof } from "../lib/proof-assessment";
import { proofTemplates } from "@workspace/api-zod";
test("six-case baseline runs real gates with no model calls or fabricated cost", async () => {
  const report = await evaluateProof("rules", "Baseline");
  assert.equal(report.total, 6);
  assert.equal(report.passed, 6);
  assert.equal(report.modelCalls, 0);
  assert.equal(report.estimatedCostMicros, 0);
  assert.ok(report.cases.every((c) => c.citationsValid));
});
test("live benchmark accounts for nine successful specialist reviews and skips blocked cases", async () => {
  const report = await evaluateProof(
    "live-ai",
    "Mock boundary",
    async (_i, a) => ({
      model: "test-model",
      notes: a.findings.map((f) => ({
        findingId: f.id,
        explanation: f.explanation,
        citationIds: f.citationIds,
      })),
      inputTokens: 100,
      outputTokens: 20,
      durationMs: 1,
      estimatedCostMicros: 7,
    }),
  );
  assert.equal(report.passed, 6);
  assert.equal(report.modelCalls, 9);
  assert.equal(report.inputTokens, 900);
  assert.equal(report.estimatedCostMicros, 63);
});
test("provider errors remain failed evaluations with unknown usage, not successful policy blocks", async () => {
  const report = await evaluateProof(
    "live-ai",
    "Unavailable provider",
    async () => {
      throw Error("Provider failed");
    },
  );
  assert.equal(report.passed, 3);
  assert.equal(report.modelCalls, 0);
  assert.equal(report.estimatedCostMicros, null);
  assert.equal(
    report.cases.filter((c) => c.actual === "execution-error").length,
    3,
  );
});
test("citation benchmark detects altered quotes and unrelated finding references", () => {
  const input = structuredClone(proofTemplates[0].input);
  const analysis = assessProof(input);
  assert.equal(citationsMatchInputs(input, analysis), true);
  analysis.citations[0].quote = "invented";
  assert.equal(citationsMatchInputs(input, analysis), false);
  const second = assessProof(input);
  second.findings[0].citationIds = second.findings[1].citationIds;
  assert.equal(citationsMatchInputs(input, second), false);
});
