import type { NodeDefinition } from "../types";
import { fingerprintRequest, financeReviewDemo } from "../demo-outputs";
import { financeReviewSchema } from "../schemas";
import { generateAgentOutput } from "../../lib/llm";

export const financeReviewNode: NodeDefinition = {
  agentSlug: "finance-analyst",
  stepName: "Finance & Budget Review",
  pendingStatus: "finance_review",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const demoFallback = financeReviewDemo(request, fp);
    const output = await generateAgentOutput({
      agentSlug: "finance-analyst",
      agentName: "Finance Analyst",
      systemPrompt:
        "You are the Finance Analyst agent. Verify spend fits budget, model forecast and ROI.",
      userPrompt: `${request.title}\n\n${request.description}`,
      demoFallback,
      schema: financeReviewSchema,
    });
    const budgetCheck = output["budgetCheck"] as { passes: boolean; utilizationPct: number };
    return {
      output,
      reasoningSummary: budgetCheck?.passes
        ? `Spend fits within budget at ${budgetCheck.utilizationPct}% quarterly utilization.`
        : `Spend exceeds safe threshold at ${budgetCheck?.utilizationPct}% utilization — defer recommended.`,
      confidence: (output["confidence"] as string) ?? "0.9",
      toolsUsed: ["budget_query", "forecast_model", "roi_calculator"],
      toolCalls: [
        {
          toolName: "budget_query",
          status: "success",
          input: { department: request.department, quarter: "current" },
          output: (budgetCheck as Record<string, unknown>) ?? {},
          outputSummary: `Department budget utilization at ${budgetCheck?.utilizationPct}%.`,
          durationMs: 224,
        },
        {
          toolName: "forecast_model",
          status: "success",
          input: { horizonMonths: 12 },
          output: (output["forecast"] as Record<string, unknown>) ?? {},
          outputSummary: "12-month impact forecast generated.",
          durationMs: 718,
        },
        {
          toolName: "roi_calculator",
          status: "success",
          input: { spendCents: fp.costCents },
          output: { irr: (output["forecast"] as { irr?: string })?.irr ?? "0.15" },
          outputSummary: "Computed IRR and payback period.",
          durationMs: 158,
        },
      ],
      activity: [
        {
          action: "finance_review_complete",
          message: `Finance Analyst ${
            budgetCheck?.passes ? "approved" : "deferred"
          } spend at ${budgetCheck?.utilizationPct}% utilization.`,
        },
      ],
    };
  },
};
