import type { NodeDefinition } from "../types";
import { composeAuditEntry } from "../../lib/audit";

export const finalizeNode: NodeDefinition = {
  key: "finalize",
  agentSlug: "ops-conductor",
  stepName: "Finalize Workflow",
  pendingStatus: "finalized",
  run: async (ctx) => {
    const isApproved = ctx.workflowRun.status === "approved";
    const followUps = isApproved
      ? [
          `Send drafted memo to ${ctx.request.department} leadership`,
          "Update vendor record with engagement metadata",
          "Schedule 30-day post-engagement review",
        ]
      : [
          "Notify requester of rejection with summary",
          "Archive supporting agent reports",
        ];
    const finalizedAt = new Date().toISOString();

    ctx.state.approvalStatus = isApproved ? "approved" : "rejected";
    ctx.state.finalNextActions = followUps;

    return {
      output: {
        summary: isApproved
          ? "Workflow finalized — follow-up actions prepared; external dispatch has not been performed."
          : "Workflow finalized — rejection recorded; stakeholder notifications have not been sent.",
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
        ? "Workflow finalized — follow-up actions prepared; external dispatch has not been performed."
        : "Workflow finalized — rejection recorded; stakeholder notifications have not been sent.",
      confidence: "1.0",
      toolsUsed: ["dispatch_queue"],
      toolCalls: [
        {
          toolName: "dispatch_queue",
          status: "success",
          input: { outcome: isApproved ? "approved" : "rejected" },
          output: { dispatched: false, executionKind: "simulation" },
          outputSummary:
            "Demonstration follow-up plan prepared. No dispatch queue was invoked.",
          durationMs: 0,
        },
      ],
      activity: [
        composeAuditEntry({
          action: "stage_transition",
          message: `Stage advanced ${ctx.workflowRun.status} → ${isApproved ? "finalized" : "rejected"}. Workflow closed by Ops Conductor.`,
          actor: "ops-conductor",
          actorType: "agent",
          agentSlug: "ops-conductor",
          from: ctx.workflowRun.status,
          to: isApproved ? "finalized" : "rejected",
          change: `status: ${ctx.workflowRun.status} → ${isApproved ? "finalized" : "rejected"}; outcome=${isApproved ? "approved" : "rejected"}`,
          metadata: { outcome: isApproved ? "approved" : "rejected" },
        }),
      ],
    };
  },
};
