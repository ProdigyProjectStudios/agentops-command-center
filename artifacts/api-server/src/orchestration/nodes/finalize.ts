import type { NodeDefinition } from "../types";

export const finalizeNode: NodeDefinition = {
  agentSlug: "ops-conductor",
  stepName: "Finalize Workflow",
  pendingStatus: "finalized",
  run: async ({ request, workflowRun }) => {
    const isApproved = workflowRun.status === "approved";
    return {
      output: {
        outcome: isApproved ? "approved" : "rejected",
        finalizedAt: new Date().toISOString(),
        followUps: isApproved
          ? [
              `Send drafted memo to ${request.department} leadership`,
              "Update vendor record with engagement metadata",
              "Schedule 30-day post-engagement review",
            ]
          : [
              "Notify requester of rejection with summary",
              "Archive supporting agent reports",
            ],
      },
      reasoningSummary: isApproved
        ? "Workflow finalized — distributing artifacts to downstream systems."
        : "Workflow finalized — recording rejection and notifying stakeholders.",
      confidence: "1.0",
      toolsUsed: ["dispatch_queue"],
      toolCalls: [
        {
          toolName: "dispatch_queue",
          status: "success",
          input: { outcome: isApproved ? "approved" : "rejected" },
          output: { dispatched: true },
          outputSummary: "Final artifacts queued for dispatch.",
          durationMs: 64,
        },
      ],
      activity: [
        {
          action: "workflow_finalized",
          message: `Workflow finalized as ${isApproved ? "approved" : "rejected"}.`,
        },
      ],
    };
  },
};
