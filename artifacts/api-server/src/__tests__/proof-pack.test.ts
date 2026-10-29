import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proofPackHtml,
  proofPackSummary,
} from "@workspace/api-zod";
import { proofTemplates, type ProofRun } from "@workspace/api-zod";
import { assessProof } from "../lib/proof-assessment";
const input = structuredClone(proofTemplates[0].input);
const run: ProofRun = {
  id: "synthetic-pack-test",
  input,
  analysis: assessProof(input),
  status: "blocked",
  createdAt: "2026-10-29T12:00:00Z",
  updatedAt: "2026-10-29T12:00:00Z",
  review: null,
  receipt: null,
  delivery: { attempts: 0, lastAttemptAt: null, verifiedAt: null, error: null },
  events: [],
};
test("proof packs describe incomplete, rejected and completed outcomes without fabricated delivery", () => {
  assert.match(proofPackSummary(run).outcome, /blocked/);
  assert.equal(proofPackSummary(run).receipt, "No verified receipt");
  assert.match(
    proofPackSummary({ ...run, status: "rejected" }).outcome,
    /rejected/,
  );
  assert.match(
    proofPackSummary({ ...run, status: "awaiting-review" }).outcome,
    /no completed/,
  );
});
test("HTML packs escape malicious text and omit full document bodies", () => {
  const copy = structuredClone(run);
  copy.input.title = '<script>alert("title")</script>';
  copy.input.documents[0].text += "\nPRIVATE-UNCITED-SOURCE-BODY";
  copy.analysis.citations[0].quote = '<img src=x onerror="alert(1)">';
  copy.events.push({
    at: copy.createdAt,
    action: "<script>alert(2)</script>",
    detail: "<iframe src=x>",
  });
  const html = proofPackHtml(copy);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src="));
  assert.ok(!html.includes("PRIVATE-UNCITED-SOURCE-BODY"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("line 1"));
});
