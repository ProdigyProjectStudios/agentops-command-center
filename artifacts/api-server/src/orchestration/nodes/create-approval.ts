import type { NodeDefinition } from "../types";
import { fingerprintRequest, synthesisDemo } from "../demo-outputs";

export const createApprovalNode: NodeDefinition = {
  agentSlug: "ops-conductor",
  stepName: "Open Approval Gate",
  pendingStatus: "approval_pending",
  run: async ({ request }) => {
    const fp = fingerprintRequest(request);
    const synthesis = synthesisDemo(request, fp);
    return {
      output: {
        gate: "operator_approval",
        riskLevel: fp.riskLevel,
        summary: synthesis["summary"],
        recommendation:
          synthesis["recommendedDecision"] === "approve"
            ? `Recommend approve: ${synthesis["summary"]}`
            : `Recommend reject: blocking concerns identified during synthesis.`,
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
        {
          action: "approval_opened",
          message: "Approval card created and added to the operator queue.",
        },
      ],
    };
  },
};
