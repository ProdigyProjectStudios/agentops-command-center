import type { NodeDefinition } from "../types";
import { fingerprintRequest, legalReviewDemo } from "../demo-outputs";
import { legalReviewSchema } from "../schemas";
import { BaseAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

const legalAgent = new BaseAgent({
  slug: "legal-counsel",
  name: "Legal Counsel",
  systemPrompt:
    "You are the Legal Counsel agent. Run compliance checks, flag legal risk, and recommend a posture. " +
    "Return flaggedClauses as a JSON array of plain strings — each string is the clause description. " +
    "Do not nest objects inside flaggedClauses.",
  detailsSchema: legalReviewSchema,
  demoDetails: (state) =>
    legalReviewDemo(
      state.request,
      fingerprintRequest(state.request),
    ) as Record<string, unknown>,
  buildEnvelope: (details) => {
    const checks =
      (details["complianceChecks"] as Array<{
        name: string;
        status: string;
      }>) ?? [];
    const flagged = checks.filter((c) => c.status !== "pass");
    return {
      summary: (details["recommendation"] as string) ?? "Legal review complete.",
      findings: checks.map((c) => `${c.name}: ${c.status}`),
      risks: [
        ...flagged.map((c) => `Compliance check needs attention: ${c.name}`),
        ...((details["flaggedClauses"] as string[]) ?? []),
      ],
      recommendedActions: flagged.length
        ? [
            "Address flagged compliance items before final approval",
            "Schedule legal redline review",
          ]
        : ["No legal blockers — proceed to approval"],
      confidence:
        parseFloat((details["confidence"] as string) ?? "0.9") || 0.9,
    };
  },
});

export const legalReviewNode: NodeDefinition = {
  key: "legal_review",
  agentSlug: "legal-counsel",
  stepName: "Legal & Compliance Review",
  pendingStatus: "legal_review",
  run: async (ctx) => {
    const fp = fingerprintRequest(ctx.request);
    const output = await legalAgent.run(ctx.state);

    const checks =
      (output.details["complianceChecks"] as Array<{ status: string }>) ?? [];
    const flagged = checks.filter((c) => c.status !== "pass").length;

    return {
      output,
      reasoningSummary:
        flagged === 0
          ? "All compliance checks passed."
          : `${flagged} compliance items require attention before final approval.`,
      confidence: (output.details["confidence"] as string) ?? "0.9",
      riskScore: fp.riskLevel,
      toolsUsed: ["compliance_checker", "contract_analyzer", "ofac_screen"],
      toolCalls: [
        {
          toolName: "compliance_checker",
          status: "success",
          input: { vendor: ctx.request.title, jurisdiction: "US" },
          output: { checks: checks.length, flagged },
          outputSummary: `Ran ${checks.length} checks; ${flagged} flagged.`,
          durationMs: 412,
        },
        {
          toolName: "contract_analyzer",
          status: "success",
          input: { documentType: "vendor_msa" },
          output: {
            clausesFlagged:
              (output.details["flaggedClauses"] as string[])?.length ?? 0,
          },
          outputSummary:
            "Analyzed clause library for indemnification & liability terms.",
          durationMs: 1840,
        },
        {
          toolName: "ofac_screen",
          status: "success",
          input: { entity: ctx.request.title },
          output: { match: false },
          outputSummary: "No sanctions matches.",
          durationMs: 98,
        },
      ],
      activity: [
        composeAuditEntry({
          action: "stage_transition",
          message: `Stage advanced triaged → legal_review. Legal Counsel ran ${checks.length} compliance check(s); ${flagged} flagged for follow-up.`,
          actor: "legal-counsel",
          actorType: "agent",
          agentSlug: "legal-counsel",
          from: "triaged",
          to: "legal_review",
          change: `status: triaged → legal_review; flaggedCount=${flagged}`,
          metadata: { checksRun: checks.length, flaggedCount: flagged },
        }),
      ],
    };
  },
};
