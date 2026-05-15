import type { NodeDefinition } from "../types";
import { fingerprintRequest, synthesisDemo } from "../demo-outputs";
import { synthesisSchema } from "../schemas";
import { runAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

export const synthesisNode: NodeDefinition = {
  key: "risk_synthesis",
  agentSlug: "ops-conductor",
  stepName: "Risk Synthesis",
  pendingStatus: "communications_draft",
  run: async ({ request, state }) => {
    const fp = fingerprintRequest(request);
    const demoDetails = synthesisDemo(request, fp) as Record<string, unknown>;

    // Pull risks/recommendations forward from earlier agents in the state.
    const upstreamRisks: string[] = [];
    const upstreamFindings: string[] = [];
    for (const [k, v] of Object.entries(state.agentOutputs)) {
      if (k === "risk_synthesis") continue;
      upstreamRisks.push(...v.risks);
      upstreamFindings.push(...v.findings.slice(0, 2));
    }

    const output = await runAgent(
      {
        agentSlug: "ops-conductor",
        agentName: "Ops Conductor",
        systemPrompt:
          "Synthesize all downstream agent outputs into a final risk posture and recommendation.",
        detailsSchema: synthesisSchema,
        demoDetails,
        buildEnvelope: (details) => ({
          summary: (details["summary"] as string) ?? "Synthesis complete.",
          findings: [
            ...((details["keyEvidence"] as string[]) ?? []),
            ...upstreamFindings.slice(0, 4),
          ],
          risks: [
            ...((details["blockingIssues"] as string[]) ?? []),
            ...upstreamRisks,
          ],
          recommendedActions: (details["nextActions"] as string[]) ?? [],
          confidence:
            parseFloat((details["confidence"] as string) ?? "0.9") || 0.9,
        }),
      },
      `${request.title}\n\n${request.description}`,
    );

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
          input: { agentCount: Object.keys(state.agentOutputs).length },
          output: {
            evidenceCount:
              ((output.details["keyEvidence"] as string[]) ?? []).length,
          },
          outputSummary: "Aggregated evidence across all reviewing agents.",
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
          "Ops Conductor synthesized agent reports into final recommendation.",
          {
            recommendedDecision: output.details["recommendedDecision"],
            upstreamRiskCount: upstreamRisks.length,
          },
          { agentSlug: "ops-conductor" },
        ),
      ],
    };
  },
};
