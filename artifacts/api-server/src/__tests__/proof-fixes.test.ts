import { test } from "node:test";
import assert from "node:assert/strict";
import type { OperationalRequest } from "@workspace/db";
import { fingerprintRequest } from "../orchestration/demo-outputs";
import { validateProofAi } from "../lib/proof-ai-contract";
import { assessProof } from "../lib/proof-assessment";
import { proofTemplates } from "@workspace/api-zod";
import { integrationAuthorized } from "../lib/proof-github";

for (const priority of ["low", "medium", "high", "urgent"]) {
  test(`explicit roofing spend is preserved at ${priority} priority`, () => {
    const fp = fingerprintRequest({
      title: "Approve $48K roofing contractor",
      description: "CFO approval above $25K.",
      priority,
    } as OperationalRequest);
    assert.equal(fp.costCents, 4800000);
  });
}
test("literal decimals and fallback estimates are handled without priority inflation", () => {
  assert.equal(
    fingerprintRequest({
      title: "Repair $1,234.56",
      description: "",
      priority: "urgent",
    } as OperationalRequest).costCents,
    123456,
  );
  assert.equal(
    fingerprintRequest({
      title: "Roofing repair",
      description: "",
      priority: "urgent",
    } as OperationalRequest).costCents,
    4800000,
  );
});
test("AI cannot promote a supplied synthetic identifier into real vendor verification", () => {
  const analysis = assessProof(proofTemplates[0].input),
    f = analysis.findings[0];
  const notes = validateProofAi(
    {
      notes: [
        {
          findingId: f.id,
          explanation:
            "This verifies an authorized and recognized vendor identity.",
          citationIds: f.citationIds,
        },
      ],
    },
    analysis,
  );
  assert.ok(
    notes[0].explanation.startsWith("Supplied synthetic evidence only."),
  );
  assert.ok(!notes[0].explanation.includes("authorized"));
  assert.throws(() =>
    validateProofAi(
      {
        notes: [
          {
            findingId: f.id,
            explanation: "The supplied field matches the fictional rule.",
            citationIds: ["made-up"],
          },
        ],
      },
      analysis,
    ),
  );
});
test("integration operator authorization rejects missing, weak and mismatched keys", () => {
  assert.equal(integrationAuthorized("", ""), false);
  assert.equal(integrationAuthorized("short", "short"), false);
  assert.equal(integrationAuthorized("b".repeat(32), "a".repeat(32)), false);
  assert.equal(integrationAuthorized("a".repeat(32), "a".repeat(32)), true);
});
