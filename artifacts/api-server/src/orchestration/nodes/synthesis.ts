import type { NodeDefinition } from "../types";
import { fingerprintRequest, synthesisDemo } from "../demo-outputs";
import { synthesisSchema } from "../schemas";
import { BaseAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

const synthesisAgent = new BaseAgent({
  slug: "ops-conductor",
  name: "Ops Conductor",
  systemPrompt:
    "Synthesize all downstream agent outputs into a final risk posture and recommendation.",
  detailsSchema: synthesisSchema,
  demoDetails: (state) =>
    synthesisDemo(
      state.request,
      fingerprintRequest(state.request),
    ) as Record<string, unknown>,
  buildEnvelope: (details, state) => {
    // Pull risks/findings forward from every upstream agent in shared state.
    const upstreamRisks: string[] = [];
    const upstreamFindings: string[] = [];
    for (const [k, v] of Object.entries(state.agentOutputs)) {
      if (k === "synthesis") continue;
      upstreamRisks.push(...v.risks);
      upstreamFindings.push(...v.findings.slice(0, 2));
    }
    return {
      summary: (details["summary"] as string) ?? "Synthesis complete.",
      findings: [
        ...((details["keyEvidence"] as string[]) ?? []),
        ...upstreamFindings.slice(0, 4),
      ],
      risks: [
        ...((details["blockingIssues"] as string[]) ?? []),
        ...upstreamRisks,
        ...state.riskFlags,
      ],
      recommendedActions: (details["nextActions"] as string[]) ?? [],
      confidence:
        parseFloat((details["confidence"] as string) ?? "0.9") || 0.9,
    };
  },
});

export const synthesisNode: NodeDefinition = {
  key: "synthesis",
  agentSlug: "ops-conductor",
  stepName: "Risk Synthesis",
  pendingStatus: "communications_draft",
  run: async (ctx) => {
    const fp = fingerprintRequest(ctx.request);
    const output = await synthesisAgent.run(ctx.state);
    const upstreamCount = Object.keys(ctx.state.agentOutputs).length;

    return {
      output,
      reasoningSummary: output.summary,
      confidence: (output.details["confidence"] as string) ?? "0.9",
      riskScore: fp.riskLevel,
      riskLevel: fp.riskLevel,
      toolsUsed: ["evidence_aggregator", "decision_synthesizer"],
      toolCalls: [
        {
          toolName: "evidence_aggregator",
          status: "success",
          input: { agentCount: upstreamCount },
          output: {
            evidenceCount:
              ((output.details["keyEvidence"] as string[]) ?? []).length,
          },
          outputSummary: `Aggregated evidence across ${upstreamCount} upstream agent(s).`,
          durationMs: 184,
        },
        {
          toolName: "decision_synthesizer",
          status: "success",
          input: { riskLevel: fp.riskLevel },
          output: { recommendation: output.details["recommendedDecision"] },
          outputSummary: `Synthesized recommendation: ${output.details["recommendedDecision"]}.`,
          durationMs: 296,
        },
      ],
      activity: [
        composeAuditEntry(
          "synthesis_complete",
          `Ops Conductor synthesized ${upstreamCount} upstream agent report(s) into recommendation: ${output.details["recommendedDecision"]}.`,
          {
            recommendedDecision: output.details["recommendedDecision"],
            upstreamRiskCount: ctx.state.riskFlags.length,
            upstreamAgentCount: upstreamCount,
          },
          { agentSlug: "ops-conductor" },
        ),
      ],
    };
  },
};
