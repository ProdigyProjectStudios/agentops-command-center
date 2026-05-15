import type { NodeDefinition } from "../types";
import { communicationsDemo, fingerprintRequest } from "../demo-outputs";
import { generateAgentOutput } from "../../lib/llm";

export const communicationsDraftNode: NodeDefinition = {
  agentSlug: "communications",
  stepName: "Communications Draft",
  pendingStatus: "communications_draft",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoFallback = communicationsDemo(request, fp);
    const output = await generateAgentOutput({
      agentSlug: "communications",
      agentName: "Communications Lead",
      systemPrompt:
        "You are the Communications agent. Draft polished internal and external messaging.",
      userPrompt: `${request.title}\n\n${request.description}`,
      demoFallback,
    });
    return {
      output,
      reasoningSummary: `Drafted internal memo + ${
        fp.riskLevel === "low" ? "no" : "stakeholder"
      } external announcement.`,
      confidence: (output["confidence"] as string) ?? "0.9",
      toolsUsed: ["memo_generator", "tone_classifier"],
      toolCalls: [
        {
          toolName: "memo_generator",
          status: "success",
          input: { audience: "internal", riskLevel: fp.riskLevel },
          output: {
            wordCount: ((output["internalMemo"] as string) ?? "").split(/\s+/).length,
          },
          outputSummary: "Generated internal memo draft.",
          durationMs: 1340,
        },
        {
          toolName: "tone_classifier",
          status: "success",
          input: { text: "memo" },
          output: { tone: output["tone"] ?? "neutral" },
          outputSummary: `Tone classified as ${output["tone"] ?? "neutral"}.`,
          durationMs: 76,
        },
      ],
      activity: [
        {
          action: "comms_drafted",
          message: "Communications agent drafted internal memo and distribution plan.",
        },
      ],
    };
  },
};
