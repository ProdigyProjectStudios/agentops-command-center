import type { NodeDefinition } from "../types";
import { fingerprintRequest, opsTriageDemo } from "../demo-outputs";
import { opsTriageSchema } from "../schemas";
import { runAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

export const opsTriageNode: NodeDefinition = {
  key: "ops_triage",
  agentSlug: "ops-conductor",
  stepName: "Triage & Routing",
  pendingStatus: "triaged",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoDetails = opsTriageDemo(request, fp) as Record<string, unknown>;

    const output = await runAgent(
      {
        agentSlug: "ops-conductor",
        agentName: "Ops Conductor",
        systemPrompt:
          "You are the Ops Conductor agent. Triage the request, decide which downstream agents to route to, and estimate cost.",
        detailsSchema: opsTriageSchema,
        demoDetails,
        buildEnvelope: (details) => {
          const routed = (details["routedAgents"] as string[]) ?? [];
          return {
            summary: `Routed to ${routed.join(", ")} based on ${fp.category} fingerprint.`,
            findings: [
              `Classification: ${details["classification"] ?? fp.category}`,
              `Initial risk: ${details["initialRiskLevel"] ?? fp.riskLevel}`,
              `Estimated spend: $${(((details["estimatedCostCents"] as number) ?? fp.costCents) / 100).toLocaleString()}`,
            ],
            risks:
              fp.riskLevel === "high" || fp.riskLevel === "critical"
                ? [`Scenario fingerprint flags ${fp.riskLevel} risk profile.`]
                : [],
            recommendedActions: routed.map((a) => `Dispatch to ${a}`),
            confidence: 0.95,
          };
        },
      },
      `${request.title}\n\n${request.description}`,
    );

    return {
      output,
      reasoningSummary: output.summary,
      confidence: "0.95",
      riskScore: fp.riskLevel,
      estimatedCostCents: fp.costCents,
      riskLevel: fp.riskLevel,
      toolsUsed: ["request_classifier", "agent_router"],
      toolCalls: [
        {
          toolName: "request_classifier",
          status: "success",
          input: { title: request.title, description: request.description },
          output: { category: fp.category, riskLevel: fp.riskLevel },
          outputSummary: `Classified as "${fp.category}" with ${fp.riskLevel} risk profile.`,
          durationMs: 142,
        },
        {
          toolName: "agent_router",
          status: "success",
          input: { category: fp.category },
          output: { agents: fp.routedAgents },
          outputSummary: `Routed to ${fp.routedAgents.length} downstream agents.`,
          durationMs: 38,
        },
      ],
      activity: [
        composeAuditEntry(
          "triage_complete",
          `Ops Conductor triaged request as ${fp.category} (${fp.riskLevel} risk).`,
          { routedAgents: fp.routedAgents },
          { agentSlug: "ops-conductor" },
        ),
      ],
    };
  },
};
