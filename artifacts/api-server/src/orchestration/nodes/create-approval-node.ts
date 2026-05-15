import type { NodeDefinition } from "../types";
import { fingerprintRequest, synthesisDemo } from "../demo-outputs";
import { composeAuditEntry } from "../../lib/audit";

export const createApprovalNode: NodeDefinition = {
  key: "approval",
  agentSlug: "ops-conductor",
  stepName: "Open Approval Gate",
  pendingStatus: "approval_pending",
  run: async (ctx) => {
    const fp = fingerprintRequest(ctx.request);

    // Pull live synthesis output from the shared WorkflowState.
    const synthesis = ctx.state.agentOutputs["synthesis"];
    const synthDetails = synthesis?.details ?? synthesisDemo(ctx.request, fp);
    const summary =
      synthesis?.summary ?? (synthDetails["summary"] as string) ?? "";
    const recommendedDecision =
      (synthDetails["recommendedDecision"] as string) ?? "approve";
    const recommendation =
      recommendedDecision === "approve"
        ? `Recommend approve: ${summary}`
        : `Recommend reject: blocking concerns identified during synthesis.`;

    // Flip approval status on the shared state for downstream observers.
    ctx.state.approvalStatus = "pending";
    ctx.state.finalSummary = summary;
    ctx.state.finalNextActions = synthesis?.recommendedActions ?? [];

    return {
      output: {
        summary: `Approval gate opened — ${recommendedDecision === "approve" ? "approval recommended" : "rejection recommended"}.`,
        findings: synthesis?.findings ?? [],
        risks: synthesis?.risks ?? [],
        recommendedActions: [
          "Operator: review approval card and decide",
          ...((synthesis?.recommendedActions ?? []).slice(0, 2)),
        ],
        toolCallsRequested: [],
        confidence: 0.95,
        details: {
          gate: "operator_approval",
          riskLevel: fp.riskLevel,
          summary,
          recommendation,
        },
      },
      reasoningSummary:
        "All upstream reviews complete. Workflow paused awaiting human operator decision.",
      confidence: "0.95",
      toolsUsed: ["approval_queue"],
      toolCalls: [
        {
          toolName: "approval_queue",
          status: "success",
          input: { workflowTitle: ctx.request.title },
          output: { queued: true },
          outputSummary: "Approval card pushed to operator queue.",
          durationMs: 52,
        },
      ],
      activity: [
        composeAuditEntry({
          action: "stage_transition",
          message: `Stage advanced communications_draft → approval_pending. Approval card created and queued for operator decision (recommendation: ${recommendedDecision}).`,
          actor: "ops-conductor",
          actorType: "agent",
          agentSlug: "ops-conductor",
          from: "communications_draft",
          to: "approval_pending",
          change: `status: communications_draft → approval_pending; approvalStatus → pending`,
          metadata: { recommendedDecision, approvalStatus: "pending" },
        }),
      ],
    };
  },
};
