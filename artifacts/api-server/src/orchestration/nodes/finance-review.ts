import type { NodeDefinition } from "../types";
import { fingerprintRequest, financeReviewDemo } from "../demo-outputs";
import { financeReviewSchema } from "../schemas";
import { BaseAgent } from "../../lib/agents/base-agent";
import { composeAuditEntry } from "../../lib/audit";

const financeAgent = new BaseAgent({
  slug: "finance-analyst",
  name: "Finance Analyst",
  systemPrompt:
    "You are the Finance Analyst agent. Verify spend fits budget, model forecast and ROI.",
  detailsSchema: financeReviewSchema,
  demoDetails: (state) =>
    financeReviewDemo(
      state.request,
      fingerprintRequest(state.request),
    ) as Record<string, unknown>,
  buildEnvelope: (details) => {
    const bc = details["budgetCheck"] as {
      passes: boolean;
      utilizationPct: number;
      requestedCents: number;
    };
    const forecast = details["forecast"] as {
      paybackPeriodMonths: number;
      irr: string;
    };
    return {
      summary:
        (details["recommendation"] as string) ?? "Finance review complete.",
      findings: [
        `Budget utilization: ${bc?.utilizationPct ?? 0}%`,
        `12-month payback: ${forecast?.paybackPeriodMonths ?? "?"} months`,
        `Projected IRR: ${forecast?.irr ?? "n/a"}`,
      ],
      risks: bc?.passes
        ? []
        : [
            `Spend pushes department past 85% quarterly utilization (${bc?.utilizationPct}%).`,
          ],
      recommendedActions: bc?.passes
        ? ["Approve spend within budget envelope"]
        : [
            "Defer or rescope to fit quarterly budget",
            "Escalate to CFO for override approval",
          ],
      confidence:
        parseFloat((details["confidence"] as string) ?? "0.88") || 0.88,
    };
  },
});

export const financeReviewNode: NodeDefinition = {
  key: "finance_review",
  agentSlug: "finance-analyst",
  stepName: "Finance & Budget Review",
  pendingStatus: "finance_review",
  run: async (ctx) => {
    const fp = fingerprintRequest(ctx.request);
    const output = await financeAgent.run(ctx.state);

    const budgetCheck = output.details["budgetCheck"] as {
      passes: boolean;
      utilizationPct: number;
    };
    return {
      output,
      reasoningSummary: budgetCheck?.passes
        ? `Spend fits within budget at ${budgetCheck.utilizationPct}% quarterly utilization.`
        : `Spend exceeds safe threshold at ${budgetCheck?.utilizationPct}% utilization — defer recommended.`,
      confidence: (output.details["confidence"] as string) ?? "0.9",
      toolsUsed: ["budget_query", "forecast_model", "roi_calculator"],
      toolCalls: [
        {
          toolName: "budget_query",
          status: "success",
          input: { department: ctx.request.department, quarter: "current" },
          output: (budgetCheck as Record<string, unknown>) ?? {},
          outputSummary: `Department budget utilization at ${budgetCheck?.utilizationPct}%.`,
          durationMs: 224,
        },
        {
          toolName: "forecast_model",
          status: "success",
          input: { horizonMonths: 12 },
          output:
            (output.details["forecast"] as Record<string, unknown>) ?? {},
          outputSummary: "12-month impact forecast generated.",
          durationMs: 718,
        },
        {
          toolName: "roi_calculator",
          status: "success",
          input: { spendCents: fp.costCents },
          output: {
            irr:
              (output.details["forecast"] as { irr?: string })?.irr ?? "0.15",
          },
          outputSummary: "Computed IRR and payback period.",
          durationMs: 158,
        },
      ],
      activity: [
        composeAuditEntry({
          action: "stage_transition",
          message: `Stage advanced legal_review → finance_review. Finance Analyst ${
            budgetCheck?.passes ? "approved" : "deferred"
          } spend at ${budgetCheck?.utilizationPct}% quarterly utilization.`,
          actor: "finance-analyst",
          actorType: "agent",
          agentSlug: "finance-analyst",
          from: "legal_review",
          to: "finance_review",
          change: `status: legal_review → finance_review; budgetUtilization=${budgetCheck?.utilizationPct}%`,
          metadata: {
            passes: budgetCheck?.passes,
            utilizationPct: budgetCheck?.utilizationPct,
          },
        }),
      ],
    };
  },
};
