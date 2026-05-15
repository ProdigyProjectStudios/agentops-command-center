import type { NodeDefinition } from "../types";
import { fingerprintRequest, memoryLookupDemo } from "../demo-outputs";
import { memoryLookupSchema } from "../schemas";
import { runAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";
import { keywordSearcher } from "../../lib/memory/keyword-search";

export const memoryLookupNode: NodeDefinition = {
  key: "memory_lookup",
  agentSlug: "memory-keeper",
  stepName: "Knowledge Grounding",
  pendingStatus: "triaged",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);

    // Real keyword search against knowledge_documents + memory_chunks. The
    // searcher is pluggable so a future pgvector/hybrid implementation can
    // drop in without changing this node.
    const memoryResult = await keywordSearcher.search(
      `${request.title} ${request.description}`,
      { limit: 5 },
    );

    const demoDetails = memoryLookupDemo(request, fp) as Record<string, unknown>;
    // Prefer real DB hits when present; otherwise leave demo citations.
    if (memoryResult.hits.length > 0) {
      demoDetails["citedDocuments"] = memoryResult.hits.map((h) => ({
        title: h.title,
        category: h.category,
        relevance: Math.min(0.99, 0.6 + h.score * 0.05),
      }));
      demoDetails["semanticMatches"] = memoryResult.tokens.length;
      demoDetails["summary"] =
        `Surfaced ${memoryResult.hits.length} knowledge document(s) via keyword search ` +
        `on [${memoryResult.tokens.slice(0, 4).join(", ")}].`;
    }

    const output = await runAgent(
      {
        agentSlug: "memory-keeper",
        agentName: "Memory Keeper",
        systemPrompt:
          "You are the Memory Keeper. Retrieve relevant policies and prior decisions from the knowledge base.",
        detailsSchema: memoryLookupSchema,
        demoDetails,
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
      },
      `${request.title}\n\n${request.description}`,
    );

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
        composeAuditEntry(
          "memory_grounded",
          `Memory Keeper grounded the workflow in ${memoryResult.hits.length} cited document(s).`,
          {
            tokens: memoryResult.tokens,
            documentIds: memoryResult.hits.map((h) => h.documentId),
          },
          { agentSlug: "memory-keeper" },
        ),
      ],
    };
  },
};
