import type { RecordedActivity } from "../orchestration/types";

export type AuditActorType = "agent" | "system" | "operator" | "tool";

/**
 * Strongly-typed audit-entry input. Every node + the engine routes through
 * `composeAuditEntry` so timeline rows share a uniform schema:
 *   - actor / actorType  → who performed the action
 *   - agentSlug / toolName → optional identifying refs
 *   - action / message  → enum-style verb + human-readable summary
 *   - from / to         → explicit status transition (when applicable)
 *   - change            → free-form field-level change description
 *   - metadata          → extra structured context
 *   - workflowRunId / stepIndex → context refs
 */
export interface AuditInput {
  action: string;
  message: string;
  actor?: string;
  actorType?: AuditActorType;
  agentSlug?: string;
  toolName?: string;
  from?: string;
  to?: string;
  change?: string;
  metadata?: Record<string, unknown>;
  workflowRunId?: number;
  stepIndex?: number;
}

/**
 * Backwards-compatible context shape (older call sites pass this third arg
 * positionally). Used by the legacy 4-arg signature below.
 */
export interface AuditContext {
  agentSlug?: string;
  workflowRunId?: number;
  stepIndex?: number;
  actor?: string;
  actorType?: AuditActorType;
  toolName?: string;
  from?: string;
  to?: string;
  change?: string;
}

function buildEntry(input: AuditInput): RecordedActivity {
  const meta: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    timestamp: new Date().toISOString(),
  };
  if (input.actor !== undefined) meta["actor"] = input.actor;
  if (input.actorType !== undefined) meta["actorType"] = input.actorType;
  if (input.agentSlug !== undefined) meta["agentSlug"] = input.agentSlug;
  if (input.toolName !== undefined) meta["toolName"] = input.toolName;
  if (input.from !== undefined) meta["from"] = input.from;
  if (input.to !== undefined) meta["to"] = input.to;
  if (input.change !== undefined) meta["change"] = input.change;
  if (input.workflowRunId !== undefined)
    meta["workflowRunId"] = input.workflowRunId;
  if (input.stepIndex !== undefined) meta["stepIndex"] = input.stepIndex;
  return {
    action: input.action,
    message: input.message,
    metadata: meta,
  };
}

/**
 * composeAuditEntry produces a uniform audit / activity-log entry. Supports
 * two call shapes for ergonomic call sites:
 *
 *   1. Object form (preferred for new code):
 *      composeAuditEntry({ action, message, from, to, agentSlug, ... })
 *
 *   2. Legacy positional form (kept for existing nodes/engine):
 *      composeAuditEntry(action, message, metadata?, ctx?)
 *      where ctx may carry agentSlug, workflowRunId, from, to, change, etc.
 */
export function composeAuditEntry(input: AuditInput): RecordedActivity;
export function composeAuditEntry(
  action: string,
  message: string,
  metadata?: Record<string, unknown>,
  ctx?: AuditContext,
): RecordedActivity;
export function composeAuditEntry(
  arg1: AuditInput | string,
  arg2?: string,
  arg3?: Record<string, unknown>,
  arg4?: AuditContext,
): RecordedActivity {
  if (typeof arg1 === "string") {
    return buildEntry({
      action: arg1,
      message: arg2 ?? "",
      ...(arg3 ? { metadata: arg3 } : {}),
      ...(arg4?.agentSlug !== undefined ? { agentSlug: arg4.agentSlug } : {}),
      ...(arg4?.actor !== undefined ? { actor: arg4.actor } : {}),
      ...(arg4?.actorType !== undefined ? { actorType: arg4.actorType } : {}),
      ...(arg4?.toolName !== undefined ? { toolName: arg4.toolName } : {}),
      ...(arg4?.from !== undefined ? { from: arg4.from } : {}),
      ...(arg4?.to !== undefined ? { to: arg4.to } : {}),
      ...(arg4?.change !== undefined ? { change: arg4.change } : {}),
      ...(arg4?.workflowRunId !== undefined
        ? { workflowRunId: arg4.workflowRunId }
        : {}),
      ...(arg4?.stepIndex !== undefined ? { stepIndex: arg4.stepIndex } : {}),
    });
  }
  return buildEntry(arg1);
}
