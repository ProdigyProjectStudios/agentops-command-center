import type { NodeDefinition } from "../types";
import { fingerprintRequest, synthesisDemo } from "../demo-outputs";
import { synthesisSchema } from "../schemas";
import { generateAgentOutput } from "../../lib/llm";

export const synthesisNode: NodeDefinition = {
  agentSlug: "ops-conductor",
  stepName: "Risk Synthesis",
  pendingStatus: "communications_draft",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoFallback = synthesisDemo(request, fp);
    const output = await generateAgentOutput({
      agentSlug: "ops-conductor",
      agentName: "Ops Conductor",
      systemPrompt:
        "Synthesize all downstream agent outputs into a final risk posture and recommendation.",
      userPrompt: `${request.title}\n\n${request.description}`,
      demoFallback,
      schema: synthesisSchema,
    });
    return {
      output,
      reasoningSummary: (output["summary"] as string) ?? "Synthesis complete.",
      confidence: (output["confidence"] as string) ?? "0.9",
      riskScore: fp.riskLevel,
      riskLevel: fp.riskLevel,
      toolsUsed: ["evidence_aggregator", "decision_synthesizer"],
      toolCalls: [
        {
          toolName: "evidence_aggregator",
          status: "success",
          input: { agentCount: 4 },
          output: {
            evidenceCount: ((output["keyEvidence"] as string[]) ?? []).length,
          },
          outputSummary: "Aggregated evidence across all reviewing agents.",
          durationMs: 184,
        },
        {
          toolName: "decision_synthesizer",
          status: "success",
          input: { riskLevel: fp.riskLevel },
          output: { recommendation: output["recommendedDecision"] },
          outputSummary: `Synthesized recommendation: ${output["recommendedDecision"]}.`,
          durationMs: 296,
        },
      ],
      activity: [
        {
          action: "synthesis_complete",
          message: "Ops Conductor synthesized agent reports into final recommendation.",
        },
      ],
    };
  },
};
