import type { RecordedActivity } from "../orchestration/types";

export interface AuditContext {
  agentSlug?: string;
  workflowRunId?: number;
  stepIndex?: number;
}

/**
 * composeAuditEntry produces a uniform audit / activity-log entry. Every node
 * (and the engine itself) routes through this helper so timeline metadata
 * stays consistent (timestamp, agent attribution, contextual ids).
 */
export function composeAuditEntry(
  action: string,
  message: string,
  metadata: Record<string, unknown> = {},
  ctx: AuditContext = {},
): RecordedActivity {
  return {
    action,
    message,
    metadata: {
      ...metadata,
      ...(ctx.agentSlug ? { agentSlug: ctx.agentSlug } : {}),
      ...(ctx.workflowRunId !== undefined
        ? { workflowRunId: ctx.workflowRunId }
        : {}),
      ...(ctx.stepIndex !== undefined ? { stepIndex: ctx.stepIndex } : {}),
      timestamp: new Date().toISOString(),
    },
  };
}
