import { eq } from "drizzle-orm";
import {
  activityLogsTable,
  agentStepsTable,
  agentsTable,
  approvalRequestsTable,
  db,
  operationalRequestsTable,
  toolCallsTable,
  workflowRunsTable,
  type AgentStep,
  type WorkflowRun,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { FINALIZE_NODE, PIPELINE } from "./edges";
import { fingerprintRequest, synthesisDemo } from "./demo-outputs";
import type { NodeContext, NodeDefinition, NodeResult } from "./types";

async function loadContext(workflowRunId: number): Promise<{
  workflowRun: WorkflowRun;
  request: typeof operationalRequestsTable.$inferSelect;
} | null> {
  const [workflowRun] = await db
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.id, workflowRunId));
  if (!workflowRun) return null;
  const [request] = await db
    .select()
    .from(operationalRequestsTable)
    .where(eq(operationalRequestsTable.id, workflowRun.requestId));
  if (!request) return null;
  return { workflowRun, request };
}

async function getAgentIdBySlug(slug: string): Promise<number> {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug));
  if (!agent) throw new Error(`Agent not found: ${slug}`);
  return agent.id;
}

async function executeNode(
  node: NodeDefinition,
  ctx: NodeContext,
  stepIndex: number,
): Promise<{ step: AgentStep; result: NodeResult }> {
  const agentId = await getAgentIdBySlug(node.agentSlug);
  const startedAt = new Date();

  const [step] = await db
    .insert(agentStepsTable)
    .values({
      workflowRunId: ctx.workflowRun.id,
      agentId,
      stepIndex,
      name: node.stepName,
      status: "running",
      input: { request: ctx.request.title },
      startedAt,
    })
    .returning();

  if (!step) throw new Error("Failed to create agent step");

  let result: NodeResult;
  try {
    result = await node.run(ctx);
  } catch (err) {
    logger.error({ err, stepIndex, agentSlug: node.agentSlug }, "Node failed");
    await db
      .update(agentStepsTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        output: { error: String(err) },
      })
      .where(eq(agentStepsTable.id, step.id));
    throw err;
  }

  const completedAt = new Date();
  const updated = await db
    .update(agentStepsTable)
    .set({
      status: "completed",
      output: result.output,
      reasoningSummary: result.reasoningSummary ?? null,
      confidence: result.confidence ?? null,
      riskScore: result.riskScore ?? null,
      toolsUsed: result.toolsUsed ?? [],
      completedAt,
    })
    .where(eq(agentStepsTable.id, step.id))
    .returning();

  for (const tc of result.toolCalls ?? []) {
    await db.insert(toolCallsTable).values({
      workflowRunId: ctx.workflowRun.id,
      agentStepId: step.id,
      toolName: tc.toolName,
      status: tc.status,
      input: tc.input,
      output: tc.output,
      outputSummary: tc.outputSummary,
      durationMs: tc.durationMs,
    });
  }

  for (const a of result.activity ?? []) {
    await db.insert(activityLogsTable).values({
      workflowRunId: ctx.workflowRun.id,
      actor: node.agentSlug,
      actorType: "agent",
      action: a.action,
      message: a.message,
      metadata: a.metadata ?? {},
    });
  }

  return { step: updated[0]!, result };
}

export class WorkflowEngine {
  async run(workflowRunId: number): Promise<void> {
    const loaded = await loadContext(workflowRunId);
    if (!loaded) throw new Error(`Workflow run ${workflowRunId} not found`);
    let { workflowRun, request } = loaded;

    if (
      workflowRun.status !== "submitted" &&
      workflowRun.status !== "failed"
    ) {
      logger.info(
        { workflowRunId, status: workflowRun.status },
        "Workflow already past submitted; skipping rerun",
      );
      return;
    }

    // Clear any artifacts from a prior failed/aborted attempt so the timeline
    // stays deterministic and stepIndex never collides on rerun.
    await db
      .delete(toolCallsTable)
      .where(eq(toolCallsTable.workflowRunId, workflowRunId));
    await db
      .delete(agentStepsTable)
      .where(eq(agentStepsTable.workflowRunId, workflowRunId));
    await db
      .delete(activityLogsTable)
      .where(eq(activityLogsTable.workflowRunId, workflowRunId));
    await db
      .delete(approvalRequestsTable)
      .where(eq(approvalRequestsTable.workflowRunId, workflowRunId));

    const startedAt = new Date();
    [workflowRun] = await db
      .update(workflowRunsTable)
      .set({ status: "triaged", startedAt, currentStage: "triaged" })
      .where(eq(workflowRunsTable.id, workflowRunId))
      .returning();

    await db.insert(activityLogsTable).values({
      workflowRunId,
      actor: "system",
      actorType: "system",
      action: "workflow_started",
      message: "Workflow run started.",
    });

    const priorSteps = new Map<string, AgentStep>();
    const priorOutputs = new Map<string, Record<string, unknown>>();

    let lastResult: NodeResult | undefined;
    try {
      for (let i = 0; i < PIPELINE.length; i++) {
        const node = PIPELINE[i]!;
        const ctx: NodeContext = {
          workflowRun,
          request,
          priorSteps,
          priorOutputs,
        };
        const { step, result } = await executeNode(node, ctx, i);
        priorSteps.set(node.agentSlug + ":" + i, step);
        priorOutputs.set(node.agentSlug + ":" + i, result.output);
        lastResult = result;

        const updates: Partial<typeof workflowRunsTable.$inferInsert> = {
          status: node.pendingStatus as typeof workflowRun.status,
          currentStage: node.pendingStatus,
        };
        if (result.estimatedCostCents != null) {
          updates.estimatedCostCents = result.estimatedCostCents;
        }
        if (result.riskLevel) updates.riskLevel = result.riskLevel;
        [workflowRun] = await db
          .update(workflowRunsTable)
          .set(updates)
          .where(eq(workflowRunsTable.id, workflowRunId))
          .returning();
      }
    } catch (err) {
      logger.error({ err, workflowRunId }, "Pipeline failed; marking run failed");
      await db
        .update(workflowRunsTable)
        .set({ status: "failed", currentStage: "failed", completedAt: new Date() })
        .where(eq(workflowRunsTable.id, workflowRunId));
      await db.insert(activityLogsTable).values({
        workflowRunId,
        actor: "system",
        actorType: "system",
        action: "workflow_failed",
        message: `Pipeline failed: ${String(err)}`,
      });
      throw err;
    }

    const fp = fingerprintRequest(request);
    const synthesis = synthesisDemo(request, fp);
    const summary = (synthesis["summary"] as string) ?? "";
    const recommendation =
      synthesis["recommendedDecision"] === "approve"
        ? `Recommend approve: ${summary}`
        : `Recommend reject based on synthesis findings.`;

    await db
      .update(workflowRunsTable)
      .set({
        status: "approval_pending",
        currentStage: "approval_pending",
        summary,
        finalRecommendation: recommendation,
        nextActions: (synthesis["nextActions"] as string[]) ?? [],
      })
      .where(eq(workflowRunsTable.id, workflowRunId));

    await db.insert(approvalRequestsTable).values({
      workflowRunId,
      status: "pending",
      riskLevel: fp.riskLevel,
      summary,
      recommendation,
    });

    void lastResult;
  }

  async finalize(workflowRunId: number): Promise<void> {
    const loaded = await loadContext(workflowRunId);
    if (!loaded) throw new Error(`Workflow run ${workflowRunId} not found`);
    const { workflowRun, request } = loaded;

    if (
      workflowRun.status !== "approved" &&
      workflowRun.status !== "rejected"
    ) {
      logger.info(
        { workflowRunId, status: workflowRun.status },
        "Workflow not in finalize-eligible state",
      );
      return;
    }

    const existingSteps = await db
      .select()
      .from(agentStepsTable)
      .where(eq(agentStepsTable.workflowRunId, workflowRunId));
    const stepIndex = existingSteps.length;

    const ctx: NodeContext = {
      workflowRun,
      request,
      priorSteps: new Map(),
      priorOutputs: new Map(),
    };
    await executeNode(FINALIZE_NODE, ctx, stepIndex);

    await db
      .update(workflowRunsTable)
      .set({
        status: "finalized",
        currentStage: "finalized",
        completedAt: new Date(),
      })
      .where(eq(workflowRunsTable.id, workflowRunId));
  }
}

export const engine: WorkflowEngine = new WorkflowEngine();
