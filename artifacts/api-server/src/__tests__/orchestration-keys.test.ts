import { test } from "node:test";
import assert from "node:assert/strict";
import { PIPELINE, FINALIZE_NODE } from "../orchestration/edges";

test("every NodeDefinition has a unique stable key", () => {
  const all = [...PIPELINE, FINALIZE_NODE];
  const keys = all.map((n) => n.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dupes, [], `duplicate keys found: ${dupes.join(", ")}`);
  for (const k of keys) {
    assert.match(
      k,
      /^[a-z][a-z0-9_]*$/,
      `key "${k}" should be snake_case lower`,
    );
  }
});

test("every NodeDefinition has a unique stepName for hydration mapping", () => {
  const all = [...PIPELINE, FINALIZE_NODE];
  const names = all.map((n) => n.stepName);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(
    dupes,
    [],
    `duplicate stepNames break engine hydration: ${dupes.join(", ")}`,
  );
});

test("synthesis and approval-gate keys are the documented values", () => {
  // create-approval depends on reading state.agentOutputs["risk_synthesis"];
  // engine derives the workflow summary from the same key. If anyone renames
  // synthesisNode.key, this test catches it before runtime breakage.
  const synth = PIPELINE.find((n) => n.stepName === "Risk Synthesis");
  const approval = PIPELINE.find((n) => n.stepName === "Open Approval Gate");
  assert.equal(synth?.key, "risk_synthesis");
  assert.equal(approval?.key, "approval_gate");
});
