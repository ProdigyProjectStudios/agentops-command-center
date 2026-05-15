import type { NodeDefinition } from "../types";
import { fingerprintRequest, legalReviewDemo } from "../demo-outputs";
import { generateAgentOutput } from "../../lib/llm";

export const legalReviewNode: NodeDefinition = {
  agentSlug: "legal-counsel",
  stepName: "Legal & Compliance Review",
  pendingStatus: "legal_review",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoFallback = legalReviewDemo(request, fp);
    const output = await generateAgentOutput({
      agentSlug: "legal-counsel",
      agentName: "Legal Counsel",
      systemPrompt:
        "You are the Legal Counsel agent. Run compliance checks, flag legal risk, and recommend a posture.",
      userPrompt: `${request.title}\n\n${request.description}`,
      demoFallback,
    });
    const checks = (output["complianceChecks"] as Array<{ status: string }>) ?? [];
    const flagged = checks.filter((c) => c.status !== "pass").length;
    return {
      output,
      reasoningSummary:
        flagged === 0
          ? "All compliance checks passed."
          : `${flagged} compliance items require attention before final approval.`,
      confidence: (output["confidence"] as string) ?? "0.9",
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
            clausesFlagged: (output["flaggedClauses"] as string[])?.length ?? 0,
          },
          outputSummary: "Analyzed clause library for indemnification & liability terms.",
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
        {
          action: "legal_review_complete",
          message: `Legal Counsel completed compliance review with ${flagged} flagged item(s).`,
        },
      ],
    };
  },
};
