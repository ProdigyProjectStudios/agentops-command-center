import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateScenario, scenarios } from "../lib/proof-engine";
for (const id of ["authorization-ready", "revenue-ready"]) {
  test(`${id}: requires review before submission`, () => {
    const run = evaluateScenario(id);
    assert.equal(run.status, "awaiting-review");
    assert.equal(run.receipt, null);
    const approved = evaluateScenario(id, "approve");
    assert.equal(approved.status, "sandbox-submitted");
    assert.equal(approved.receipt?.externalDelivery, false);
    assert.equal(
      approved.receipt?.id,
      evaluateScenario(id, "approve").receipt?.id,
    );
    assert.equal(evaluateScenario(id, "reject").status, "rejected");
    assert.equal(evaluateScenario(id, "reject").receipt, null);
  });
}
for (const id of ["authorization-missing", "revenue-duplicate"]) {
  test(`${id}: cannot bypass blockers by approving`, () => {
    const run = evaluateScenario(id, "approve");
    assert.equal(run.status, "blocked");
    assert.ok(run.blockers.length);
    assert.equal(run.receipt, null);
  });
}
test("unknown input is rejected", () =>
  assert.throws(() => evaluateScenario("real-patient")));
test("fingerprints distinguish inputs and all evidence references a policy", () => {
  const runs = scenarios.map((s) => evaluateScenario(s.id));
  assert.equal(new Set(runs.map((r) => r.fingerprint)).size, 4);
  for (const run of runs) {
    assert.ok(run.evidence.every((e) => e.rule.includes(run.policyVersion)));
    assert.equal(run.capabilities.livePayer, false);
  }
});
test("edited evidence changes the decision and fingerprint", () => {
  const original = evaluateScenario("authorization-missing");
  const repaired = evaluateScenario("authorization-missing", undefined, {
    documents: ["referral", "coverage", "supporting-note"],
  });
  assert.equal(repaired.status, "awaiting-review");
  assert.notEqual(original.fingerprint, repaired.fingerprint);
  assert.equal(
    evaluateScenario("authorization-ready", "approve", { documents: [] })
      .status,
    "blocked",
  );
});
