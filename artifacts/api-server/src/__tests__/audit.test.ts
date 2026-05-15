import { test } from "node:test";
import assert from "node:assert/strict";
import { composeAuditEntry } from "../lib/audit";

test("composeAuditEntry includes timestamp and merges metadata", () => {
  const before = Date.now();
  const entry = composeAuditEntry(
    "thing_happened",
    "A thing happened.",
    { extra: 42 },
    { agentSlug: "ops-conductor", workflowRunId: 7, stepIndex: 3 },
  );
  const after = Date.now();
  assert.equal(entry.action, "thing_happened");
  assert.equal(entry.message, "A thing happened.");
  const md = entry.metadata as Record<string, unknown>;
  assert.equal(md["extra"], 42);
  assert.equal(md["agentSlug"], "ops-conductor");
  assert.equal(md["workflowRunId"], 7);
  assert.equal(md["stepIndex"], 3);
  const ts = new Date(md["timestamp"] as string).getTime();
  assert.ok(ts >= before && ts <= after, "timestamp should be in window");
});

test("composeAuditEntry omits unset context fields", () => {
  const entry = composeAuditEntry("a", "b");
  const md = entry.metadata as Record<string, unknown>;
  assert.equal("agentSlug" in md, false);
  assert.equal("workflowRunId" in md, false);
  assert.equal("stepIndex" in md, false);
  assert.ok("timestamp" in md);
});
