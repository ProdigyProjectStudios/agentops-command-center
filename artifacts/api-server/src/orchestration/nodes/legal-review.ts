import type { NodeDefinition } from "../types";
import { fingerprintRequest, legalReviewDemo } from "../demo-outputs";
import { legalReviewSchema } from "../schemas";
import { runAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

export const legalReviewNode: NodeDefinition = {
  key: "legal_review",
  agentSlug: "legal-counsel",
  stepName: "Legal & Compliance Review",
  pendingStatus: "legal_review",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoDetails = legalReviewDemo(request, fp) as Record<string, unknown>;

    const output = await runAgent(
      {
        agentSlug: "legal-counsel",
        agentName: "Legal Counsel",
        systemPrompt:
          "You are the Legal Counsel agent. Run compliance checks, flag legal risk, and recommend a posture.",
        detailsSchema: legalReviewSchema,
        demoDetails,
        buildEnvelope: (details) => {
          const checks =
            (details["complianceChecks"] as Array<{
              name: string;
              status: string;
            }>) ?? [];
          const flagged = checks.filter((c) => c.status !== "pass");
          return {
            summary:
              (details["recommendation"] as string) ??
              "Legal review complete.",
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
      },
      `${request.title}\n\n${request.description}`,
    );

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
          input: { vendor: request.title, jurisdiction: "US" },
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
          input: { entity: request.title },
          output: { match: false },
          outputSummary: "No sanctions matches.",
          durationMs: 98,
        },
      ],
      activity: [
        composeAuditEntry(
          "legal_review_complete",
          `Legal Counsel completed compliance review with ${flagged} flagged item(s).`,
          { flaggedCount: flagged },
          { agentSlug: "legal-counsel" },
        ),
      ],
    };
  },
};
