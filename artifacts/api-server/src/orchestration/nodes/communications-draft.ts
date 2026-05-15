import type { NodeDefinition } from "../types";
import { communicationsDemo, fingerprintRequest } from "../demo-outputs";
import { communicationsSchema } from "../schemas";
import { runAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

export const communicationsDraftNode: NodeDefinition = {
  key: "communications_draft",
  agentSlug: "communications",
  stepName: "Communications Draft",
  pendingStatus: "communications_draft",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoDetails = communicationsDemo(request, fp) as Record<
      string,
      unknown
    >;

    const output = await runAgent(
      {
        agentSlug: "communications",
        agentName: "Communications Lead",
        systemPrompt:
          "You are the Communications agent. Draft polished internal and external messaging.",
        detailsSchema: communicationsSchema,
        demoDetails,
        buildEnvelope: (details) => {
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
      },
      `${request.title}\n\n${request.description}`,
    );

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
        composeAuditEntry(
          "comms_drafted",
          "Communications agent drafted internal memo and distribution plan.",
          {},
          { agentSlug: "communications" },
        ),
      ],
    };
  },
};
