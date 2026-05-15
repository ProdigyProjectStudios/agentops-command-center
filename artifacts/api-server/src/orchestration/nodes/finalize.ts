import type { NodeDefinition } from "../types";
import { composeAuditEntry } from "../../lib/audit";

export const finalizeNode: NodeDefinition = {
  key: "finalize",
  agentSlug: "ops-conductor",
  stepName: "Finalize Workflow",
  pendingStatus: "finalized",
  run: async ({ request, workflowRun }) => {
    const isApproved = workflowRun.status === "approved";
    const followUps = isApproved
      ? [
          `Send drafted memo to ${request.department} leadership`,
          "Update vendor record with engagement metadata",
          "Schedule 30-day post-engagement review",
        ]
      : [
          "Notify requester of rejection with summary",
          "Archive supporting agent reports",
        ];
    const finalizedAt = new Date().toISOString();

    return {
      output: {
        summary: isApproved
          ? "Workflow finalized — distributing artifacts to downstream systems."
          : "Workflow finalized — recording rejection and notifying stakeholders.",
        findings: [`Outcome: ${isApproved ? "approved" : "rejected"}`],
        risks: [],
        recommendedActions: followUps,
        toolCallsRequested: [],
        confidence: 1.0,
        details: {
          outcome: isApproved ? "approved" : "rejected",
          finalizedAt,
          followUps,
        },
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
        composeAuditEntry(
          "workflow_finalized",
          `Workflow finalized as ${isApproved ? "approved" : "rejected"}.`,
          { outcome: isApproved ? "approved" : "rejected" },
          { agentSlug: "ops-conductor" },
        ),
      ],
    };
  },
};
