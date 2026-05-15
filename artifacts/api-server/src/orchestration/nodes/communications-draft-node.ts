import type { NodeDefinition } from "../types";
import { communicationsDemo, fingerprintRequest } from "../demo-outputs";
import { communicationsSchema } from "../schemas";
import { BaseAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

const commsAgent = new BaseAgent({
  slug: "communications",
  name: "Communications Lead",
  systemPrompt:
    "You are the Communications agent. Draft polished internal and external messaging.",
  detailsSchema: communicationsSchema,
  demoDetails: (state) =>
    communicationsDemo(
      state.request,
      fingerprintRequest(state.request),
    ) as Record<string, unknown>,
  buildEnvelope: (details, state) => {
    const fp = fingerprintRequest(state.request);
    const distribution = (details["distributionList"] as string[]) ?? [];
    return {
      summary: `Drafted internal memo + ${
        fp.riskLevel === "low" ? "no" : "stakeholder"
      } external announcement.`,
      findings: [
        `Tone: ${details["tone"] ?? "neutral"}`,
        `Distribution: ${distribution.join(", ")}`,
      ],
      risks:
        fp.riskLevel === "critical"
          ? [
              "Critical-risk request — confirm legal sign-off before any external distribution.",
            ]
          : [],
      recommendedActions: [
        "Park drafted memo in approval queue",
        "Notify distribution list once operator approves",
      ],
      confidence:
        parseFloat((details["confidence"] as string) ?? "0.91") || 0.91,
    };
  },
});

export const communicationsDraftNode: NodeDefinition = {
  key: "communications",
  agentSlug: "communications",
  stepName: "Communications Draft",
  pendingStatus: "communications_draft",
  run: async (ctx) => {
    const fp = fingerprintRequest(ctx.request);
    const output = await commsAgent.run(ctx.state);

    return {
      output,
      reasoningSummary: output.summary,
      confidence: (output.details["confidence"] as string) ?? "0.9",
      toolsUsed: ["memo_generator", "tone_classifier"],
      toolCalls: [
        {
          toolName: "memo_generator",
          status: "success",
          input: { audience: "internal", riskLevel: fp.riskLevel },
          output: {
            wordCount: ((output.details["internalMemo"] as string) ?? "").split(
              /\s+/,
            ).length,
          },
          outputSummary: "Generated internal memo draft.",
          durationMs: 1340,
        },
        {
          toolName: "tone_classifier",
          status: "success",
          input: { text: "memo" },
          output: { tone: output.details["tone"] ?? "neutral" },
          outputSummary: `Tone classified as ${output.details["tone"] ?? "neutral"}.`,
          durationMs: 76,
        },
      ],
      activity: [
        composeAuditEntry({
          action: "stage_transition",
          message: `Stage advanced finance_review → communications_draft. Communications Lead drafted internal memo and distribution plan.`,
          actor: "communications",
          actorType: "agent",
          agentSlug: "communications",
          from: "finance_review",
          to: "communications_draft",
          change: `status: finance_review → communications_draft`,
          metadata: { tone: output.details["tone"] ?? "neutral" },
        }),
      ],
    };
  },
};
