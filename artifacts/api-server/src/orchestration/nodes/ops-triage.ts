import type { NodeDefinition } from "../types";
import { fingerprintRequest, opsTriageDemo } from "../demo-outputs";
import { opsTriageSchema } from "../schemas";
import { generateAgentOutput } from "../../lib/llm";

export const opsTriageNode: NodeDefinition = {
  agentSlug: "ops-conductor",
  stepName: "Triage & Routing",
  pendingStatus: "triaged",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoFallback = opsTriageDemo(request, fp);
    const output = await generateAgentOutput({
      agentSlug: "ops-conductor",
      agentName: "Ops Conductor",
      systemPrompt:
        "You are the Ops Conductor agent. Triage the request, decide which downstream agents to route to, and estimate cost.",
      userPrompt: `${request.title}\n\n${request.description}`,
      demoFallback,
      schema: opsTriageSchema,
    });
    return {
      output,
      reasoningSummary: `Routed to ${(output["routedAgents"] as string[]).join(
        ", ",
      )} based on ${fp.category} scenario fingerprint.`,
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
        {
          action: "triage_complete",
          message: `Ops Conductor triaged request as ${fp.category} (${fp.riskLevel} risk).`,
          metadata: { routedAgents: fp.routedAgents },
        },
      ],
    };
  },
};
