/**
 * Multi-agent workflow engine.
 *
 * This module implements a LangGraph-style state graph: a fixed pipeline of
 * nodes (PIPELINE) where each node receives a shared, mutable WorkflowState
 * (NodeContext.state) and returns an AgentOutput envelope plus side-effect
 * metadata (tool calls, audit-log activity entries). The engine persists each
 * step into agent_steps + tool_calls + activity_logs and updates the
 * workflow_runs row with progress markers.
 *
 * Why hand-rolled instead of `langgraph` directly: the JS LangGraph package
 * (`@langchain/langgraph`) is heavy, requires a langchain runtime, and ties
 * us to its message contract. The shape here intentionally mirrors LangGraph
 * primitives — `WorkflowState` is the channel/state object, each node is a
 * pure-ish function `(state) -> partial state`, and the ordering is declared
 * via PIPELINE / FINALIZE_NODE — so a future drop-in is mechanical:
 *   1. wrap each NodeDefinition.run in a langgraph `addNode` callback
 *   2. translate PIPELINE order into `addEdge`s
 *   3. swap `executeNode` for the langgraph compiled `invoke`
 *
 * Memory grounding (memory_lookup_node) goes through the pluggable
 * `keywordSearcher` in lib/memory; swap it for a vector / hybrid retriever
 * later without touching node code.
 */
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
import { getLlmMode } from "../lib/llm";
import { composeAuditEntry } from "../lib/audit";
import {
  isAgentOutput,
  type AgentOutput,
  type WorkflowState,
} from "../lib/agents/types";
import { FINALIZE_NODE, PIPELINE } from "./edges";
import { synthesisNode } from "./nodes/synthesis";
import { fingerprintRequest, synthesisDemo } from "./demo-outputs";
import type { NodeContext, NodeDefinition, NodeResult } from "./types";

const LIVE_INTER_STEP_DELAY_MS = Number(
  process.env["LIVE_INTER_STEP_DELAY_MS"] ?? "500",
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// Build the canonical stepName -> node.key map from the actual NodeDefinitions
// so hydration is exact, not derived from string-munging the persisted name.
const STEP_NAME_TO_KEY: Map<string, string> = new Map(
  [...PIPELINE, FINALIZE_NODE].map((n) => [n.stepName, n.key]),
);

/**
 * Hydrate WorkflowState.agentOutputs from previously persisted agent_steps.
 * Used by finalize() so the finalize node can see prior agent outputs even
 * after a process restart. Only AgentOutput-shaped rows are loaded; legacy
 * rows are silently skipped.
 */
async function hydrateAgentOutputs(
  workflowRunId: number,
): Promise<Record<string, AgentOutput>> {
  const steps = await db
    .select()
    .from(agentStepsTable)
    .where(eq(agentStepsTable.workflowRunId, workflowRunId));
  const out: Record<string, AgentOutput> = {};
  for (const s of steps) {
    if (!isAgentOutput(s.output)) continue;
    const key = STEP_NAME_TO_KEY.get(s.name);
    if (!key) continue;
    out[key] = s.output;
  }
  return out;
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

    const systemActivity = composeAuditEntry(
      "workflow_started",
      "Workflow run started.",
      {},
      { workflowRunId },
    );
    await db.insert(activityLogsTable).values({
      workflowRunId,
      actor: "system",
      actorType: "system",
      action: systemActivity.action,
      message: systemActivity.message,
      metadata: systemActivity.metadata ?? {},
    });

    // The shared WorkflowState that flows through every node.
    const state: WorkflowState = {
      workflowRun: workflowRun!,
      request,
      agentOutputs: {},
      metadata: { startedAt },
    };

    let synthesisResult: NodeResult | undefined;
    const liveMode = getLlmMode() === "live";
    try {
      for (let i = 0; i < PIPELINE.length; i++) {
        if (i > 0 && liveMode && LIVE_INTER_STEP_DELAY_MS > 0) {
          // Pace agent transitions in live mode so the UI can render each
          // step's running → completed handoff visibly.
          await sleep(LIVE_INTER_STEP_DELAY_MS);
        }
        const node = PIPELINE[i]!;
        // Refresh the workflowRun on the state in case prior step updated it.
        state.workflowRun = workflowRun!;
        const ctx: NodeContext = {
          state,
          workflowRun: workflowRun!,
          request,
        };
        const { result } = await executeNode(node, ctx, i);
        state.agentOutputs[node.key] = result.output;
        if (node === synthesisNode) {
          synthesisResult = result;
        }

        const updates: Partial<typeof workflowRunsTable.$inferInsert> = {
          status: node.pendingStatus as typeof workflowRun.status,
          currentStage: node.pendingStatus,
        };
        if (result.estimatedCostCents != null) {
          updates.estimatedCostCents = result.estimatedCostCents;
          state.metadata.estimatedCostCents = result.estimatedCostCents;
        }
        if (result.riskLevel) {
          updates.riskLevel = result.riskLevel;
          state.metadata.riskLevel = result.riskLevel;
        }
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
      const failedActivity = composeAuditEntry(
        "workflow_failed",
        `Pipeline failed: ${String(err)}`,
        {},
        { workflowRunId },
      );
      await db.insert(activityLogsTable).values({
        workflowRunId,
        actor: "system",
        actorType: "system",
        action: failedActivity.action,
        message: failedActivity.message,
        metadata: failedActivity.metadata ?? {},
      });
      throw err;
    }

    const fp = fingerprintRequest(request);
    const demoSynthesis = synthesisDemo(request, fp);
    // Prefer the synthesis step's AgentOutput.details (captured by node
    // identity, since the pipeline ends with createApprovalNode), falling
    // back to the deterministic demo synthesis.
    const liveDetails = synthesisResult?.output.details ?? null;
    const synthesis = liveDetails ?? demoSynthesis;
    const summary =
      synthesisResult?.output.summary && synthesisResult.output.summary.length > 0
        ? synthesisResult.output.summary
        : typeof synthesis["summary"] === "string" && synthesis["summary"].length > 0
          ? (synthesis["summary"] as string)
          : ((demoSynthesis["summary"] as string) ?? "");
    const recommendation =
      synthesis["recommendedDecision"] === "approve"
        ? `Recommend approve: ${summary}`
        : `Recommend reject based on synthesis findings.`;
    const nextActions =
      synthesisResult?.output.recommendedActions &&
      synthesisResult.output.recommendedActions.length > 0
        ? synthesisResult.output.recommendedActions
        : Array.isArray(synthesis["nextActions"])
          ? (synthesis["nextActions"] as string[])
          : ((demoSynthesis["nextActions"] as string[]) ?? []);

    await db
      .update(workflowRunsTable)
      .set({
        status: "approval_pending",
        currentStage: "approval_pending",
        summary,
        finalRecommendation: recommendation,
        nextActions,
      })
      .where(eq(workflowRunsTable.id, workflowRunId));

    await db.insert(approvalRequestsTable).values({
      workflowRunId,
      status: "pending",
      riskLevel: fp.riskLevel,
      summary,
      recommendation,
    });
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

    const agentOutputs = await hydrateAgentOutputs(workflowRunId);
    const state: WorkflowState = {
      workflowRun,
      request,
      agentOutputs,
      metadata: { startedAt: workflowRun.startedAt ?? new Date() },
    };

    const ctx: NodeContext = {
      state,
      workflowRun,
      request,
    };
    await executeNode(FINALIZE_NODE, ctx, stepIndex);

    // Preserve `rejected` as the durable terminal status so the operator
    // decision is visible in the UI. Only an approved decision graduates the
    // run to `finalized`.
    const terminalStatus =
      workflowRun.status === "approved" ? "finalized" : "rejected";

    await db
      .update(workflowRunsTable)
      .set({
        status: terminalStatus,
        currentStage: terminalStatus,
        completedAt: new Date(),
      })
      .where(eq(workflowRunsTable.id, workflowRunId));
  }
}

export const engine: WorkflowEngine = new WorkflowEngine();
