import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentOutputSchema,
  emptyAgentOutput,
  isAgentOutput,
  parseConfidence,
  getAgentOutput,
  type WorkflowState,
} from "../lib/agents/types";

test("emptyAgentOutput satisfies agentOutputSchema", () => {
  const result = agentOutputSchema.safeParse(emptyAgentOutput());
  assert.ok(result.success, "empty AgentOutput should validate");
});

test("isAgentOutput rejects malformed payloads", () => {
  assert.equal(isAgentOutput(null), false);
  assert.equal(isAgentOutput({ summary: "x" }), false);
  assert.equal(isAgentOutput({ ...emptyAgentOutput(), confidence: 2 }), false);
  assert.equal(isAgentOutput(emptyAgentOutput()), true);
});

test("parseConfidence clamps and parses string/number inputs", () => {
  assert.equal(parseConfidence(0.5), 0.5);
  assert.equal(parseConfidence("0.87"), 0.87);
  assert.equal(parseConfidence(2), 1);
  assert.equal(parseConfidence(-1), 0);
  assert.equal(parseConfidence("not-a-number", 0.42), 0.42);
});

test("getAgentOutput returns by key", () => {
  const out = emptyAgentOutput();
  out.summary = "hello";
  const state = {
    agentOutputs: { ops_triage: out },
  } as unknown as WorkflowState;
  assert.equal(getAgentOutput(state, "ops_triage")?.summary, "hello");
  assert.equal(getAgentOutput(state, "missing"), undefined);
});

test("agentOutputSchema enforces array fields and details object", () => {
  const bad = {
    summary: "x",
    findings: "should-be-array",
    risks: [],
    recommendedActions: [],
    toolCallsRequested: [],
    confidence: 0.5,
    details: {},
  };
  assert.equal(agentOutputSchema.safeParse(bad).success, false);
});
