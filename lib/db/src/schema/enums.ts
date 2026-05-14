import { pgEnum } from "drizzle-orm/pg-core";

export const workflowStatusEnum = pgEnum("workflow_status", [
  "submitted",
  "triaged",
  "legal_review",
  "finance_review",
  "communications_draft",
  "approval_pending",
  "approved",
  "rejected",
  "finalized",
  "failed",
]);

export const agentStepStatusEnum = pgEnum("agent_step_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
]);

export const priorityEnum = pgEnum("priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "active",
  "idle",
  "offline",
]);

export const toolCallStatusEnum = pgEnum("tool_call_status", [
  "success",
  "failed",
  "running",
]);
