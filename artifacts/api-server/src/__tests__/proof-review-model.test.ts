import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { cpapWorkerInput, proofTemplates } from "@workspace/api-zod";
import { assessProof } from "../lib/proof-assessment";

let chosenModel = "";
let notes: unknown[] = [];
mock.module("../lib/model-config.js", {
  namedExports: { getModelForAgent: async () => "gpt-4.1-mini" },
});
mock.module("../lib/llm.js", {
  namedExports: {
    hasApiKey: () => true,
    generateAgentOutput: async (request: { model: string; strict: boolean }) => {
      assert.equal(request.strict, true);
      chosenModel = request.model;
      return { details: { notes }, usage: {
        model: chosenModel, inputTokens: 1000, outputTokens: 1000, durationMs: 12,
      } };
    },
  },
});
const { reviewProofAi } = await import("../lib/proof-ai.js");

test("CMS migration overrides legacy settings, supports explicit rollback and prices Luna", async () => {
  const previous = process.env["HEALTHCARE_REVIEW_MODEL"];
  try {
    delete process.env["HEALTHCARE_REVIEW_MODEL"];
    const input = cpapWorkerInput(true);
    const analysis = assessProof(input);
    notes = analysis.findings.map((f) => ({
      findingId: f.id, explanation: f.explanation, citationIds: f.citationIds,
    }));
    const result = await reviewProofAi(input, analysis);
    assert.equal(chosenModel, "gpt-6-luna");
    assert.equal(result.estimatedCostMicros, 600);
    process.env["HEALTHCARE_REVIEW_MODEL"] = " gpt-4.1-mini ";
    await reviewProofAi(input, analysis);
    assert.equal(chosenModel, "gpt-4.1-mini");
    const legacy = structuredClone(proofTemplates[0].input);
    const legacyAnalysis = assessProof(legacy);
    notes = legacyAnalysis.findings.map((f) => ({
      findingId: f.id, explanation: f.explanation, citationIds: f.citationIds,
    }));
    process.env["HEALTHCARE_REVIEW_MODEL"] = "gpt-6-luna";
    await reviewProofAi(legacy, legacyAnalysis);
    assert.equal(chosenModel, "gpt-4.1-mini");
  } finally {
    if (previous === undefined) delete process.env["HEALTHCARE_REVIEW_MODEL"];
    else process.env["HEALTHCARE_REVIEW_MODEL"] = previous;
  }
});
