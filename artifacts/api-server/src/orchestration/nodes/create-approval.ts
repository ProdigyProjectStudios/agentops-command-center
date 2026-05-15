import type { NodeDefinition } from "../types";
import { fingerprintRequest, synthesisDemo } from "../demo-outputs";

export const createApprovalNode: NodeDefinition = {
  agentSlug: "ops-conductor",
  stepName: "Open Approval Gate",
  pendingStatus: "approval_pending",
  run: async ({ request, priorOutputs }) => {
    const fp = fingerprintRequest(request);
    // Prefer the live synthesis step output captured upstream so that the
    // approval card stays consistent with the workflow-level summary.
    let synthesis: Record<string, unknown> = synthesisDemo(request, fp);
    for (const [key, output] of priorOutputs.entries()) {
      if (key.startsWith("ops-conductor:") && output && typeof output["summary"] === "string") {
        synthesis = output;
        break;
      }
    }
    const summary = (synthesis["summary"] as string) ?? "";
    return {
      output: {
        gate: "operator_approval",
        riskLevel: fp.riskLevel,
        summary,
        recommendation:
          synthesis["recommendedDecision"] === "approve"
            ? `Recommend approve: ${summary}`
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
