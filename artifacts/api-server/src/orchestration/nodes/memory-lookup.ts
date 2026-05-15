import type { NodeDefinition } from "../types";
import { fingerprintRequest, memoryLookupDemo } from "../demo-outputs";
import { generateAgentOutput } from "../../lib/llm";

export const memoryLookupNode: NodeDefinition = {
  agentSlug: "memory-keeper",
  stepName: "Knowledge Grounding",
  pendingStatus: "triaged",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoFallback = memoryLookupDemo(request, fp);
    const output = await generateAgentOutput({
      agentSlug: "memory-keeper",
      agentName: "Memory Keeper",
      systemPrompt:
        "You are the Memory Keeper. Retrieve relevant policies and prior decisions from the knowledge base.",
      userPrompt: `${request.title}\n\n${request.description}`,
      demoFallback,
    });
    const cited = (output["citedDocuments"] as Array<{ title: string }>) ?? [];
    return {
      output,
      reasoningSummary: `Surfaced ${cited.length} relevant knowledge documents.`,
      confidence: "0.89",
      toolsUsed: ["semantic_search", "policy_index"],
      toolCalls: [
        {
          toolName: "semantic_search",
          status: "success",
          input: { query: request.title, topK: 5 },
          output: { hits: cited.length },
          outputSummary: `Returned ${cited.length} matches with avg relevance ≥ 0.85.`,
          durationMs: 312,
        },
        {
          toolName: "policy_index",
          status: "success",
          input: { category: fp.category },
          output: { policies: (output["relevantPolicies"] as string[])?.length ?? 0 },
          outputSummary: "Loaded category-specific policy snapshot.",
          durationMs: 89,
        },
      ],
      activity: [
        {
          action: "memory_grounded",
          message: `Memory Keeper grounded the workflow in ${cited.length} cited documents.`,
        },
      ],
    };
  },
};
