import type { NodeDefinition } from "../types";
import { fingerprintRequest, memoryLookupDemo } from "../demo-outputs";
import { memoryLookupSchema } from "../schemas";
import { BaseAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";
import { searchMemory } from "../../lib/memory/keyword-search";

const memoryAgent = new BaseAgent({
  slug: "memory-keeper",
  name: "Memory Keeper",
  systemPrompt:
    "You are the Memory Keeper. Retrieve relevant policies and prior decisions from the knowledge base.",
  detailsSchema: memoryLookupSchema,
  demoDetails: (state) => {
    const fp = fingerprintRequest(state.request);
    const demo = memoryLookupDemo(state.request, fp) as Record<string, unknown>;
    if (state.retrievedMemory.length > 0) {
      demo["citedDocuments"] = state.retrievedMemory.map((h) => ({
        title: h.title,
        category: h.category,
        relevance: Math.min(0.99, 0.6 + h.score * 0.05),
      }));
      demo["semanticMatches"] = state.retrievedMemory.length;
      demo["summary"] =
        `Surfaced ${state.retrievedMemory.length} knowledge document(s) via real keyword search.`;
    }
    return demo;
  },
  buildEnvelope: (details) => {
    const cited =
      (details["citedDocuments"] as Array<{
        title: string;
        category: string;
        relevance: number;
      }>) ?? [];
    return {
      summary:
        (details["summary"] as string) ??
        `Surfaced ${cited.length} relevant knowledge documents.`,
      findings: cited.map(
        (c) => `${c.title} (${c.category}, rel ${c.relevance.toFixed(2)})`,
      ),
      risks: [],
      recommendedActions: (details["relevantPolicies"] as string[]) ?? [],
      confidence: 0.89,
    };
  },
});

export const memoryLookupNode: NodeDefinition = {
  key: "memory_retrieval",
  agentSlug: "memory-keeper",
  stepName: "Knowledge Grounding",
  pendingStatus: "triaged",
  run: async (ctx) => {
    const fp = fingerprintRequest(ctx.request);

    // Real keyword search; results written into the shared WorkflowState so
    // downstream nodes (legal/finance/synthesis) can cite them.
    const memoryResult = await searchMemory(
      `${ctx.request.title} ${ctx.request.description}`,
      { limit: 5 },
    );
    ctx.state.retrievedMemory = memoryResult.hits.map((h) => ({
      documentId: h.documentId,
      title: h.title,
      category: h.category,
      snippet: h.snippet,
      score: h.score,
    }));

    const output = await memoryAgent.run(ctx.state);

    return {
      output,
      reasoningSummary: output.summary,
      confidence: "0.89",
      toolsUsed: ["memory_search", "policy_index"],
      toolCalls: [
        memoryResult.toolCall,
        {
          toolName: "policy_index",
          status: "success",
          input: { category: fp.category },
          output: {
            policies:
              (output.details["relevantPolicies"] as string[])?.length ?? 0,
          },
          outputSummary: "Loaded category-specific policy snapshot.",
          durationMs: 89,
        },
      ],
      activity: [
        composeAuditEntry({
          action: "memory_retrieved",
          message: `Memory Keeper retrieved ${memoryResult.hits.length} knowledge document(s) (keywords: ${memoryResult.tokens.slice(0, 4).join(", ") || "none"}) and wrote them to shared workflow state.`,
          actor: "memory-keeper",
          actorType: "agent",
          agentSlug: "memory-keeper",
          from: "triaged",
          to: "triaged",
          change: `state.retrievedMemory: 0 → ${memoryResult.hits.length} item(s)`,
          metadata: {
            tokens: memoryResult.tokens,
            documentIds: memoryResult.hits.map((h) => h.documentId),
            citedCount: memoryResult.hits.length,
          },
        }),
      ],
    };
  },
};
