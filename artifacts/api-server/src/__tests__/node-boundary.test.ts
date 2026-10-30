/**
 * Node boundary tests — DB-DEPENDENT.
 *
 * Exercises the real production agent execution boundary:
 *
 *   node.run(ctx)
 *     → BaseAgent.run(state)
 *       → getModelForAgent(slug)          [queries PostgreSQL — DB-dependent]
 *       → generateAgentOutput()           [liveCredentials()→null → demo dispatch]
 *       → demoDetails(state)              [real *Demo() fixture]
 *       → buildEnvelope(details, state)   [per-agent envelope builder]
 *       → agentOutputSchema.parse(output) [enforcement parse]
 *     → NodeResult.output                 [real AgentOutput]
 *
 * ESM evaluation order:
 *   1. Static imports are resolved and evaluated first (none of them import openai).
 *   2. Module body runs: credentials deleted, mock registered, then top-level
 *      `await import(...)` evaluates the node files — which capture the now-absent
 *      credentials in their module-level LLM constants.
 *   3. `liveCredentials()` → null → demo dispatch (no LLM calls made).
 *
 * This is NOT the same as the pure golden eval in eval-harness.test.ts.
 * That file calls *Demo() functions directly — it does not touch BaseAgent,
 * buildEnvelope, or agentOutputSchema.parse. These tests cover exactly that gap.
 *
 * Separation:
 *   eval-harness.test.ts — deterministic golden assertions, zero DB requirement.
 *   THIS FILE            — real agent boundary, requires seeded PostgreSQL.
 *
 * The DB dependency is unconcealed. getModelForAgent() queries system_settings
 * and agents tables; these tests will fail if the PostgreSQL service is not
 * running or the agent slugs are unseeded. In the Replit environment both
 * conditions are always met.
 */

// ── Step 1: delete credential env vars before any module that captures them ──
// The LLM module (`llm.ts`) reads process.env at module-evaluation time into
// module-level constants. Static imports above are evaluated before this code
// runs, but those modules do not import openai. The node files below are
// dynamically imported AFTER this deletion, so their transitive llm.ts
// evaluation sees absent credentials → liveCredentials() → null → demo mode.
delete process.env["OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import type { OperationalRequest, WorkflowRun } from "@workspace/db";

// These modules do not transitively import openai — safe to import statically.
import {
  agentOutputSchema,
  type AgentOutput,
  type WorkflowState,
} from "../lib/agents/types.js";
import {
  opsTriageSchema,
  legalReviewSchema,
  financeReviewSchema,
  synthesisSchema,
} from "../orchestration/schemas.js";
import type { NodeContext } from "../orchestration/types.js";

// ── Step 2: register OpenAI mock as a safety net ─────────────────────────────
// With no credentials, generateAgentOutput() short-circuits before constructing
// an OpenAI client. The mock below is a safety net that prevents any real API
// call if credentials somehow remain, by returning null content (which triggers
// the demo fallback with fallback.mode === "live").
class FakeOpenAI {
  constructor(_opts: unknown) {}
  chat = {
    completions: {
      create: async (_req: unknown) => ({
        choices: [{ message: { content: null } }],
      }),
    },
  };
}
mock.module("openai", { defaultExport: FakeOpenAI });

// ── Step 3: dynamic imports — evaluated AFTER credentials deleted + mock set ──
const { opsTriageNode } = await import(
  "../orchestration/nodes/ops-triage-node.js"
);
const { legalReviewNode } = await import(
  "../orchestration/nodes/legal-review-node.js"
);
const { financeReviewNode } = await import(
  "../orchestration/nodes/finance-review-node.js"
);
const { synthesisNode } = await import(
  "../orchestration/nodes/synthesis-node.js"
);

const { getModelSettings, getModelForAgent, invalidateModelCache } =
  await import("../lib/model-config.js");
const { pool } = await import("@workspace/db");

// getModelForAgent deliberately falls back on DB errors in production. A
// boundary test must not silently pass via that fallback when its DB is absent.
before(async () => {
  invalidateModelCache();
  const settings = await getModelSettings(); // uncaught connection/schema errors fail the suite
  for (const slug of ["ops-conductor", "legal-counsel", "finance-analyst"]) {
    const agent = settings.overrides.find((a) => a.agentSlug === slug);
    assert.ok(agent, `Seeded database is missing required agent: ${slug}`);
    assert.equal(
      await getModelForAgent(slug),
      agent.modelOverride || settings.defaultModel,
    );
  }
});
after(async () => {
  await pool.end();
});

// ─── Stubs ────────────────────────────────────────────────────────────────────

/**
 * Minimal OperationalRequest. All fields used by *Demo() fixture functions
 * are included; irrelevant DB-only fields are cast through `unknown`.
 */
function makeRequest(
  overrides: Partial<Record<string, unknown>> = {},
): OperationalRequest {
  return {
    id: 0,
    title: "SaaS platform license renewal",
    description:
      "Annual renewal of productivity suite licenses for the engineering team",
    priority: "low",
    department: "Engineering",
    requestedBy: "boundary-harness",
    status: "submitted",
    companyId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as OperationalRequest;
}

/**
 * WorkflowRun stub. Only finalize-node.ts reads ctx.workflowRun fields
 * directly; the four specialist nodes tested here do not.
 */
const STUB_RUN = { id: 0, status: "submitted" } as unknown as WorkflowRun;

function makeState(
  request: OperationalRequest,
  agentOutputs: Record<string, AgentOutput> = {},
): WorkflowState {
  return {
    workflowRun: STUB_RUN,
    request,
    currentStage: "triaged",
    agentOutputs,
    retrievedMemory: [],
    toolCallResults: [],
    riskFlags: [],
    finalNextActions: [],
    metadata: { startedAt: new Date() },
  };
}

function makeCtx(
  request: OperationalRequest,
  agentOutputs: Record<string, AgentOutput> = {},
): NodeContext {
  return {
    state: makeState(request, agentOutputs),
    workflowRun: STUB_RUN,
    request,
  };
}

// ─── Shared envelope assertion ────────────────────────────────────────────────

/**
 * Verify fields that only the real BaseAgent path can produce.
 *
 * Distinct from eval-harness makeEnvelope():
 *   - makeEnvelope() constructs a synthetic placeholder just to check structural
 *     validity of agentOutputSchema. It does NOT call buildEnvelope().
 *   - assertRealEnvelope() validates what buildEnvelope() actually returned
 *     through the full node.run() → BaseAgent.run() path.
 */
function assertRealEnvelope(
  output: AgentOutput,
  label: string,
  opts: { minFindings?: number } = {},
): void {
  // agentOutputSchema.safeParse — same enforcement parse BaseAgent calls internally.
  const parsed = agentOutputSchema.safeParse(output);
  assert.ok(
    parsed.success,
    `${label}: agentOutputSchema failed: ${parsed.success ? "" : parsed.error.message}`,
  );

  // summary must be real text from buildEnvelope, not a synthetic placeholder.
  assert.ok(
    typeof output.summary === "string" && output.summary.length > 5,
    `${label}: summary too short or missing: ${JSON.stringify(output.summary)}`,
  );
  assert.ok(
    !output.summary.startsWith("eval-harness synthetic"),
    `${label}: summary must not be the eval-harness placeholder`,
  );

  // findings, risks, recommendedActions are always arrays (may be empty for low risk).
  const minF = opts.minFindings ?? 1;
  assert.ok(
    Array.isArray(output.findings) && output.findings.length >= minF,
    `${label}: expected ≥ ${minF} findings, got ${output.findings?.length ?? "none"}`,
  );
  assert.ok(Array.isArray(output.risks), `${label}: risks must be an array`);
  assert.ok(
    Array.isArray(output.recommendedActions),
    `${label}: recommendedActions must be an array`,
  );

  // confidence is a finite number in (0, 1].
  assert.ok(
    typeof output.confidence === "number" &&
      output.confidence > 0 &&
      output.confidence <= 1,
    `${label}: invalid confidence: ${output.confidence}`,
  );

  // fallback must be set — proving demo dispatch ran, not a live model response.
  // mode==="demo" means no credentials were found (expected when AGENTOPS_EVAL_REPORT
  // is not set and this file correctly deleted credentials before node import).
  // mode==="live" would mean credentials survived somehow and the mock safety-net
  // triggered (empty content → fallback). Either mode proves the demo details path ran.
  assert.ok(
    output.fallback !== undefined,
    `${label}: fallback should be set — expected demo dispatch, got no fallback marker ` +
      `(live LLM call succeeded, which means credentials were not cleared before module evaluation)`,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test(
  "[node-boundary] opsTriageNode.run() → real BaseAgent → buildEnvelope → agentOutputSchema (DB-dependent)",
  async () => {
    const result = await opsTriageNode.run(makeCtx(makeRequest()));
    const { output } = result;

    assertRealEnvelope(output, "opsTriageNode", { minFindings: 3 });

    // buildEnvelope constructs: "Routed to ... based on ... fingerprint."
    assert.ok(
      output.summary.includes("fingerprint") || output.summary.includes("Routed"),
      `opsTriageNode: summary should reference routing/fingerprint, got: ${JSON.stringify(output.summary)}`,
    );

    // findings contain Classification, Initial risk, Estimated spend entries.
    assert.ok(
      output.findings.some((f) => f.startsWith("Classification:")),
      `opsTriageNode: findings must include "Classification:" entry`,
    );
    assert.ok(
      output.findings.some((f) => f.startsWith("Initial risk:")),
      `opsTriageNode: findings must include "Initial risk:" entry`,
    );
    assert.ok(
      output.findings.some((f) => f.startsWith("Estimated spend:")),
      `opsTriageNode: findings must include "Estimated spend:" entry`,
    );

    // details satisfy specialist Zod schema (the real schema, not a structural guess).
    const detailsResult = opsTriageSchema.safeParse(output.details);
    assert.ok(
      detailsResult.success,
      `opsTriageNode: details failed opsTriageSchema: ${detailsResult.success ? "" : detailsResult.error.message}`,
    );
  },
);

test(
  "[node-boundary] legalReviewNode.run() → real BaseAgent → buildEnvelope → agentOutputSchema (DB-dependent)",
  async () => {
    // High-risk keyword so the acquisition branch of legalReviewDemo fires:
    // complianceChecks has non-pass entries → buildEnvelope populates risks.
    const request = makeRequest({
      title: "Acquisition of TargetCo — strategic M&A",
      description: "Proposed acquisition of a mid-market enterprise SaaS company",
      priority: "high",
    });
    const result = await legalReviewNode.run(makeCtx(request));
    const { output } = result;

    assertRealEnvelope(output, "legalReviewNode", { minFindings: 1 });

    // buildEnvelope: summary = details.recommendation (real narrative sentence).
    assert.ok(
      output.summary.length > 10,
      `legalReviewNode: summary should be a full recommendation sentence, got: ${JSON.stringify(output.summary)}`,
    );

    // findings are formatted as "name: status" from complianceChecks array.
    assert.ok(
      output.findings.some((f) => /:\s*(pass|review|flag)/i.test(f)),
      `legalReviewNode: findings must contain "name: status" compliance-check entries`,
    );

    // High-risk acquisition → at least one risk entry (flagged checks or flaggedClauses).
    assert.ok(
      output.risks.length > 0,
      "legalReviewNode: high-risk acquisition scenario should produce ≥ 1 risk entry",
    );

    // details satisfy specialist Zod schema.
    const detailsResult = legalReviewSchema.safeParse(output.details);
    assert.ok(
      detailsResult.success,
      `legalReviewNode: details failed legalReviewSchema: ${detailsResult.success ? "" : detailsResult.error.message}`,
    );
  },
);

test(
  "[node-boundary] financeReviewNode.run() → real BaseAgent → buildEnvelope → agentOutputSchema (DB-dependent)",
  async () => {
    const result = await financeReviewNode.run(makeCtx(makeRequest()));
    const { output } = result;

    assertRealEnvelope(output, "financeReviewNode", { minFindings: 3 });

    // buildEnvelope populates exactly three findings: utilization, payback, IRR.
    assert.ok(
      output.findings.some(
        (f) => f.toLowerCase().includes("utilization") || f.toLowerCase().includes("budget"),
      ),
      `financeReviewNode: findings must include a budget/utilization entry`,
    );
    assert.ok(
      output.findings.some((f) => f.toLowerCase().includes("payback")),
      `financeReviewNode: findings must include a payback entry`,
    );
    assert.ok(
      output.findings.some((f) => f.toLowerCase().includes("irr")),
      `financeReviewNode: findings must include an IRR entry`,
    );

    // Low-cost SaaS scenario: budget passes → no 85% utilization risk entry.
    assert.ok(
      !output.risks.some((r) => r.includes("85%")),
      "financeReviewNode: low-cost SaaS scenario must not trigger the 85% utilization risk",
    );

    // details satisfy specialist Zod schema.
    const detailsResult = financeReviewSchema.safeParse(output.details);
    assert.ok(
      detailsResult.success,
      `financeReviewNode: details failed financeReviewSchema: ${detailsResult.success ? "" : detailsResult.error.message}`,
    );
  },
);

test(
  "[node-boundary] synthesisNode.run() → real BaseAgent + upstream-state aggregation → agentOutputSchema (DB-dependent)",
  async () => {
    // Provide minimal upstream outputs so synthesisNode.buildEnvelope has
    // realistic agentOutputs to aggregate risks and findings from.
    const upstreamOutputs: Record<string, AgentOutput> = {
      ops_triage: {
        summary: "Routed to legal-counsel, finance-analyst based on saas fingerprint.",
        findings: ["Classification: saas", "Initial risk: low", "Estimated spend: $480"],
        risks: [],
        recommendedActions: ["Dispatch to legal-counsel", "Dispatch to finance-analyst"],
        toolCallsRequested: [],
        confidence: 0.95,
        details: {},
      },
      legal_review: {
        summary: "All compliance checks pass. No legal blockers.",
        findings: ["Data Privacy: pass", "Regulatory: pass", "IP: pass"],
        risks: [],
        recommendedActions: ["No legal blockers — proceed to approval"],
        toolCallsRequested: [],
        confidence: 0.88,
        details: {},
      },
    };

    const result = await synthesisNode.run(
      makeCtx(makeRequest(), upstreamOutputs),
    );
    const { output } = result;

    assertRealEnvelope(output, "synthesisNode", { minFindings: 1 });

    // buildEnvelope: summary = details.summary (synthesis narrative paragraph).
    assert.ok(
      output.summary.length > 20,
      `synthesisNode: summary must be a substantive synthesis narrative, got: ${JSON.stringify(output.summary)}`,
    );

    // recommendedActions = details.nextActions — always non-empty from synthesisDemo.
    assert.ok(
      output.recommendedActions.length > 0,
      "synthesisNode: recommendedActions must be non-empty (sourced from details.nextActions)",
    );

    // findings include details.keyEvidence and/or upstream agent findings.
    assert.ok(
      output.findings.length > 0,
      "synthesisNode: findings must be non-empty (keyEvidence + upstream findings)",
    );

    // details satisfy specialist Zod schema.
    const detailsResult = synthesisSchema.safeParse(output.details);
    assert.ok(
      detailsResult.success,
      `synthesisNode: details failed synthesisSchema: ${detailsResult.success ? "" : detailsResult.error.message}`,
    );
  },
);
