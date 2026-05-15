import type { NodeDefinition } from "../types";
import { fingerprintRequest, synthesisDemo } from "../demo-outputs";
import { composeAuditEntry } from "../../lib/audit";

export const createApprovalNode: NodeDefinition = {
  key: "approval_gate",
  agentSlug: "ops-conductor",
  stepName: "Open Approval Gate",
  pendingStatus: "approval_pending",
  run: async ({ request, state }) => {
    const fp = fingerprintRequest(request);

    // Pull live synthesis output from the shared WorkflowState; fall back to
    // a deterministic demo synthesis if (somehow) the synthesis step did not
    // populate the state.
    const synthesis = state.agentOutputs["risk_synthesis"];
    const synthDetails =
      synthesis?.details ?? synthesisDemo(request, fp);
    const summary =
      synthesis?.summary ?? (synthDetails["summary"] as string) ?? "";
    const recommendedDecision =
      (synthDetails["recommendedDecision"] as string) ?? "approve";
    const recommendation =
      recommendedDecision === "approve"
        ? `Recommend approve: ${summary}`
        : `Recommend reject: blocking concerns identified during synthesis.`;

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
          input: { workflowTitle: request.title },
          output: { queued: true },
          outputSummary: "Approval card pushed to operator queue.",
          durationMs: 52,
        },
      ],
      activity: [
        composeAuditEntry(
          "approval_opened",
          "Approval card created and added to the operator queue.",
          { recommendedDecision },
          { agentSlug: "ops-conductor" },
        ),
      ],
    };
  },
};
