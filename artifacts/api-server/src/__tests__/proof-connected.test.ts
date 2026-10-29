import { test } from "node:test";
import assert from "node:assert/strict";
import { proofTemplates, type ProofAnalysis } from "@workspace/api-zod";
import { assessProof } from "../lib/proof-assessment";
import { analyzeProof } from "../lib/proof-connected";
import { retrieveProofPolicy } from "../lib/proof-policy";
import { labelGraphToolEvidence } from "../orchestration/execution-evidence";
const input = () => ({
  ...structuredClone(proofTemplates[0].input),
  connectedReview: true,
});
function review(analysis: ProofAnalysis) {
  return {
    model: "test-model",
    notes: analysis.findings.map((f) => ({
      findingId: f.id,
      explanation: f.explanation,
      citationIds: f.citationIds,
    })),
    inputTokens: 100,
    outputTokens: 30,
    durationMs: 10,
    estimatedCostMicros: 50,
  };
}
test("connected workflow freezes exact keyword policy passages and blocks insufficient sources", () => {
  const valid = input();
  const retrieval = retrieveProofPolicy(valid);
  assert.equal(retrieval.passages.length, 6);
  assert.deepEqual(retrieval.missingFields, []);
  assert.ok(
    retrieval.passages.every(
      (p) => p.documentHash.length === 64 && p.matchedTerms.includes("vendor"),
    ),
  );
  const missing = assessProof({ ...valid, policyQuery: "astronomy telescope" });
  assert.equal(missing.retrieval?.passages.length, 0);
  assert.match(missing.blockers.join(), /Insufficient policy evidence/);
  const partial = assessProof({ ...valid, policyQuery: "currency" });
  assert.equal(partial.retrieval?.passages.length, 1);
  assert.ok(partial.blockers.length);
  const snapshot = structuredClone(retrieval);
  snapshot.passages[0].version = "archived-version";
  assert.notEqual(
    assessProof(valid).fingerprint,
    assessProof(valid, snapshot).fingerprint,
  );
  assert.equal(
    assessProof(valid, snapshot).retrieval?.passages[0].version,
    "archived-version",
  );
});
test("three live specialist reviews receive earlier results and accumulate actual usage", async () => {
  const roles: string[] = [];
  const analysis = await analyzeProof(
    { ...input(), analysisMode: "live-ai" },
    async (_i, a, role) => {
      assert.equal(a.specialists?.length, roles.length);
      assert.ok(a.retrieval?.passages.length);
      roles.push(role!);
      return review(a);
    },
  );
  assert.deepEqual(roles, [
    "ops-conductor",
    "legal-counsel",
    "finance-analyst",
  ]);
  assert.equal(analysis.aiReview?.inputTokens, 300);
  assert.equal(analysis.aiReview?.estimatedCostMicros, 150);
  assert.equal(analysis.specialists?.length, 3);
});
test("missing policy evidence and blocked packet do not call specialists", async () => {
  let calls = 0;
  const adapter = async (_i: unknown, a: ProofAnalysis) => {
    calls++;
    return review(a);
  };
  await analyzeProof(
    { ...input(), analysisMode: "live-ai", policyQuery: "astronomy" },
    adapter,
  );
  const invalid = input();
  invalid.documents[0].text = "Amount: 9000";
  await analyzeProof({ ...invalid, analysisMode: "live-ai" }, adapter);
  assert.equal(calls, 0);
});
test("invalid, incomplete or failed specialist reviews cannot become completed evidence", async () => {
  const value = { ...input(), analysisMode: "live-ai" as const };
  await assert.rejects(() => analyzeProof(value), /not configured/);
  await assert.rejects(
    () =>
      analyzeProof(value, async (_i, a) => ({
        ...review(a),
        notes: [
          {
            findingId: "amount",
            explanation: "Invented evidence supplied",
            citationIds: ["invented"],
          },
        ],
      })),
    /outside/,
  );
  await assert.rejects(
    () =>
      analyzeProof(value, async (_i, a) => ({
        ...review(a),
        notes: review(a).notes.slice(0, 1),
      })),
    /omitted/,
  );
  await assert.rejects(
    () =>
      analyzeProof(value, async () => {
        throw new Error("provider unavailable");
      }),
    /provider unavailable/,
  );
});
test("legacy graph distinguishes real database search from simulated tool records", () => {
  const call = {
    toolName: "dispatch_queue",
    status: "success" as const,
    input: {},
    output: { dispatched: true },
    outputSummary: "Dispatch described",
    durationMs: 64,
  };
  const labelled = labelGraphToolEvidence(call);
  assert.equal(labelled.durationMs, 0);
  assert.equal(labelled.output.externalActionPerformed, false);
  assert.equal(labelled.output.executionKind, "simulation");
  assert.equal(labelled.output.dispatched, undefined);
  const search = labelGraphToolEvidence({
    ...call,
    toolName: "memory_search",
    output: { hits: [] },
  });
  assert.equal(search.output.executionKind, "database-search");
  assert.deepEqual(search.output.hits, []);
});
