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

test("node keys match the documented LangGraph-style contract", () => {
  // create-approval depends on reading state.agentOutputs["synthesis"];
  // engine derives the workflow summary from the same key. If anyone renames
  // these keys, this test catches it before runtime breakage.
  const expected: Record<string, string> = {
    "Triage & Routing": "ops_triage",
    "Knowledge Grounding": "memory_retrieval",
    "Legal & Compliance Review": "legal_review",
    "Finance & Budget Review": "finance_review",
    "Communications Draft": "communications",
    "Risk Synthesis": "synthesis",
    "Open Approval Gate": "approval",
    "Finalize Workflow": "finalize",
  };
  const all = [...PIPELINE, FINALIZE_NODE];
  for (const [stepName, key] of Object.entries(expected)) {
    const node = all.find((n) => n.stepName === stepName);
    assert.ok(node, `missing node for stepName "${stepName}"`);
    assert.equal(
      node!.key,
      key,
      `expected node "${stepName}" to have key "${key}"`,
    );
  }
});
