/**
 * Multi-agent workflow engine.
 *
 * LangGraph-style state graph: a fixed pipeline of nodes (PIPELINE) where
 * each node receives a shared, mutable WorkflowState (NodeContext.state) and
 * returns an AgentOutput envelope plus side-effect metadata (tool calls,
 * audit-log activity entries). The engine persists each step into
 * agent_steps + tool_calls + activity_logs, updates workflow_runs with
 * progress markers, and supports resumable execution: a re-run skips any
 * steps that already completed for this workflowRunId and only re-executes
 * the remainder.
 *
 * Why hand-rolled instead of `langgraph` directly: the JS LangGraph package
 * (`@langchain/langgraph`) is heavy, requires a langchain runtime, and ties
 * us to its message contract. The shape here intentionally mirrors LangGraph
 * primitives — `WorkflowState` is the channel/state object, each node is a
 * pure-ish function `(state) -> partial state`, and ordering is declared
 * via PIPELINE / FINALIZE_NODE — so a future drop-in is mechanical:
 *   1. wrap each NodeDefinition.run in a langgraph `addNode` callback
 *   2. translate PIPELINE order into `addEdge`s
 *   3. swap `executeNode` for the langgraph compiled `invoke`
 *
 * Memory grounding (memory_retrieval) goes through the pluggable
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
  portfolioCompaniesTable,
  toolCallsTable,
  workflowRunsTable,
  type AgentStep,
  type PortfolioCompany,
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
import { synthesisNode } from "./nodes/synthesis-node";
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
  portfolioCompany: PortfolioCompany | undefined;
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
  const [portfolioCompany] = await db
    .select()
    .from(portfolioCompaniesTable)
    .where(eq(portfolioCompaniesTable.id, request.portfolioCompanyId));
  return { workflowRun, request, portfolioCompany };
}

async function getAgentIdBySlug(slug: string): Promise<number> {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug));
  if (!agent) throw new Error(`Agent not found: ${slug}`);
  return agent.id;
}

// Canonical stepName -> node.key map, derived directly from the
// NodeDefinitions so hydration is exact (not string-munged).
const STEP_NAME_TO_KEY: Map<string, string> = new Map(
  [...PIPELINE, FINALIZE_NODE].map((n) => [n.stepName, n.key]),
);

/**
 * Hydrate previously persisted agent_steps into shared WorkflowState. Used by
 * `run()` for resumability and by `finalize()` so the finalize node sees prior
 * agent outputs even after a process restart. Only AgentOutput-shaped rows
 * (with `status="completed"`) are loaded; legacy / pending / failed rows are
 * silently skipped so the engine can re-execute them.
 */
async function hydrateState(workflowRunId: number): Promise<{
  agentOutputs: Record<string, AgentOutput>;
  completedSteps: AgentStep[];
  retrievedMemory: import("../lib/agents/types").RetrievedMemoryItem[];
  toolCallResults: import("../lib/agents/types").RecordedToolCallResult[];
}> {
  const steps = await db
    .select()
    .from(agentStepsTable)
    .where(eq(agentStepsTable.workflowRunId, workflowRunId));
  const agentOutputs: Record<string, AgentOutput> = {};
  const completedSteps: AgentStep[] = [];
  const completedStepIds = new Set<number>();
  const stepIdToAgentSlug = new Map<number, string>();
  for (const s of steps) {
    if (s.status !== "completed") continue;
    if (!isAgentOutput(s.output)) continue;
    const key = STEP_NAME_TO_KEY.get(s.name);
    if (!key) continue;
    agentOutputs[key] = s.output;
    completedSteps.push(s);
    completedStepIds.add(s.id);
  }

  // Map agent_step_id -> agent slug so we can attribute tool-call results
  // when we reconstruct toolCallResults.
  if (completedSteps.length > 0) {
    const agentRows = await db.select().from(agentsTable);
    const agentIdToSlug = new Map(agentRows.map((a) => [a.id, a.slug]));
    for (const s of completedSteps) {
      const slug = agentIdToSlug.get(s.agentId);
      if (slug) stepIdToAgentSlug.set(s.id, slug);
    }
  }

  // Pull persisted tool_calls to rebuild toolCallResults + retrievedMemory.
  const toolCallResults: import("../lib/agents/types").RecordedToolCallResult[] =
    [];
  const retrievedMemory: import("../lib/agents/types").RetrievedMemoryItem[] =
    [];
  if (completedStepIds.size > 0) {
    const persistedToolCalls = await db
      .select()
      .from(toolCallsTable)
      .where(eq(toolCallsTable.workflowRunId, workflowRunId));
    for (const tc of persistedToolCalls) {
      if (tc.agentStepId == null || !completedStepIds.has(tc.agentStepId))
        continue;
      const agentSlug = stepIdToAgentSlug.get(tc.agentStepId) ?? "unknown";
      toolCallResults.push({
        agentSlug,
        toolName: tc.toolName,
        status: tc.status,
        outputSummary: tc.outputSummary,
        durationMs: tc.durationMs,
      });
      // memory_search tool-call output payload carries the canonical memory
      // hits with snippets; rehydrate them onto state.retrievedMemory so
      // resumed downstream nodes see the same context. Dedupe by documentId
      // (keeping highest score) so repeated reruns don't inflate the channel.
      if (tc.toolName === "memory_search") {
        const out = tc.output as {
          hits?: Array<{
            documentId: number;
            title: string;
            category: string;
            snippet: string;
            score: number;
          }>;
        };
        for (const h of out.hits ?? []) {
          const existingIdx = retrievedMemory.findIndex(
            (r) => r.documentId === h.documentId,
          );
          if (existingIdx === -1) {
            retrievedMemory.push({
              documentId: h.documentId,
              title: h.title,
              category: h.category,
              snippet: h.snippet,
              score: h.score,
            });
          } else if (h.score > retrievedMemory[existingIdx]!.score) {
            retrievedMemory[existingIdx] = {
              documentId: h.documentId,
              title: h.title,
              category: h.category,
              snippet: h.snippet,
              score: h.score,
            };
          }
        }
      }
    }
  }

  return { agentOutputs, completedSteps, retrievedMemory, toolCallResults };
}

async function executeNode(
  node: NodeDefinition,
  ctx: NodeContext,
  stepIndex: number,
): Promise<{ step: AgentStep; result: NodeResult }> {
  const agentId = await getAgentIdBySlug(node.agentSlug);
  const startedAt = new Date();

  // Defensive: drop any prior pending/failed/running row at this stepIndex so
  // re-execution doesn't collide.
  const existing = await db
    .select()
    .from(agentStepsTable)
    .where(eq(agentStepsTable.workflowRunId, ctx.workflowRun.id));
  const stale = existing.find(
    (s) => s.stepIndex === stepIndex && s.status !== "completed",
  );
  if (stale) {
    await db
      .delete(toolCallsTable)
      .where(eq(toolCallsTable.agentStepId, stale.id));
    await db.delete(agentStepsTable).where(eq(agentStepsTable.id, stale.id));
  }

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
    let { workflowRun, request, portfolioCompany } = loaded;

    // Eligibility: any non-terminal pipeline status. Terminal statuses
    // (approval_pending, approved, rejected, finalized) are handled by the
    // approval/finalize paths; only `failed` re-enters here, alongside any
    // mid-pipeline status that crashed before reaching approval_pending.
    const TERMINAL_FOR_RUN: ReadonlySet<string> = new Set([
      "approval_pending",
      "approved",
      "rejected",
      "finalized",
    ]);
    if (TERMINAL_FOR_RUN.has(workflowRun.status)) {
      logger.info(
        { workflowRunId, status: workflowRun.status },
        "Workflow already at/past approval gate; run() is a no-op",
      );
      return;
    }

    // Hydrate any work that completed on a previous attempt — true resume.
    // We do NOT wipe completed agent_steps / tool_calls / activity_logs:
    // those rows are durable evidence and the timeline reads from them.
    const {
      agentOutputs,
      completedSteps,
      retrievedMemory: hydratedMemory,
      toolCallResults: hydratedToolCalls,
    } = await hydrateState(workflowRunId);
    const completedKeys = new Set(Object.keys(agentOutputs));

    // Clean up artifacts that didn't reach a "completed" state from a prior
    // failed/aborted attempt so we can re-execute from where we stopped.
    const allSteps = await db
      .select()
      .from(agentStepsTable)
      .where(eq(agentStepsTable.workflowRunId, workflowRunId));
    for (const s of allSteps) {
      if (s.status !== "completed") {
        await db
          .delete(toolCallsTable)
          .where(eq(toolCallsTable.agentStepId, s.id));
        await db
          .delete(agentStepsTable)
          .where(eq(agentStepsTable.id, s.id));
      }
    }
    // Approval requests are reset on re-run — they get re-created at the
    // approval gate.
    await db
      .delete(approvalRequestsTable)
      .where(eq(approvalRequestsTable.workflowRunId, workflowRunId));

    const isResume = completedSteps.length > 0;
    const priorStage = workflowRun.currentStage;
    const priorStatus = workflowRun.status;
    const startedAt = workflowRun.startedAt ?? new Date();
    // On resume, preserve the highest stage we already reached instead of
    // snapping back to "triaged" — that keeps the audit/status history
    // monotonic. Fresh runs advance to "triaged" as before.
    const STAGE_ORDER = [
      "submitted",
      "triaged",
      "legal_review",
      "finance_review",
      "communications_draft",
      "approval_pending",
    ];
    const resumeStage = isResume
      ? (STAGE_ORDER.indexOf(priorStage) >= STAGE_ORDER.indexOf("triaged")
          ? priorStage
          : "triaged")
      : "triaged";
    [workflowRun] = await db
      .update(workflowRunsTable)
      .set({
        status: resumeStage as typeof workflowRun.status,
        startedAt,
        currentStage: resumeStage,
      })
      .where(eq(workflowRunsTable.id, workflowRunId))
      .returning();

    const startActivity = composeAuditEntry({
      action: isResume ? "workflow_resumed" : "workflow_started",
      message: isResume
        ? `Workflow resumed from prior attempt — ${completedKeys.size} step(s) already completed.`
        : "Workflow run started — pipeline kicked off from submitted state.",
      actor: "system",
      actorType: "system",
      from: isResume ? priorStage : "submitted",
      to: resumeStage,
      change: isResume
        ? `resume: previous stage ${priorStage} (status=${priorStatus}) preserved; ${completedKeys.size} step(s) hydrated`
        : "status: submitted → triaged",
      workflowRunId,
      metadata: {
        resumedSteps: Array.from(completedKeys),
        priorStatus,
        priorStage,
      },
    });
    await db.insert(activityLogsTable).values({
      workflowRunId,
      actor: "system",
      actorType: "system",
      action: startActivity.action,
      message: startActivity.message,
      metadata: startActivity.metadata ?? {},
    });

    // The shared WorkflowState that flows through every node.
    const state: WorkflowState = {
      workflowRun: workflowRun!,
      request,
      ...(portfolioCompany ? { portfolioCompany } : {}),
      currentStage: workflowRun!.currentStage,
      agentOutputs: { ...agentOutputs },
      retrievedMemory: [...hydratedMemory],
      toolCallResults: [...hydratedToolCalls],
      riskFlags: [],
      finalNextActions: [],
      metadata: { startedAt },
    };
    // Replay risks / tool-call summaries from any hydrated outputs so the
    // synthesis node sees a consistent picture even on a fresh resume.
    for (const out of Object.values(agentOutputs)) {
      state.riskFlags.push(...out.risks);
    }

    let synthesisResult: NodeResult | undefined;
    const liveMode = getLlmMode() === "live";
    try {
      for (let i = 0; i < PIPELINE.length; i++) {
        const node = PIPELINE[i]!;

        // Resume: skip nodes whose AgentOutput we already have.
        if (completedKeys.has(node.key)) {
          logger.debug(
            { nodeKey: node.key, workflowRunId },
            "Skipping already-completed node on resume",
          );
          continue;
        }

        if (i > 0 && liveMode && LIVE_INTER_STEP_DELAY_MS > 0) {
          await sleep(LIVE_INTER_STEP_DELAY_MS);
        }
        state.workflowRun = workflowRun!;
        state.currentStage = workflowRun!.currentStage;
        const ctx: NodeContext = {
          state,
          workflowRun: workflowRun!,
          request,
        };
        const { result } = await executeNode(node, ctx, i);
        state.agentOutputs[node.key] = result.output;
        state.riskFlags.push(...result.output.risks);
        for (const tc of result.toolCalls ?? []) {
          state.toolCallResults.push({
            agentSlug: node.agentSlug,
            toolName: tc.toolName,
            status: tc.status,
            outputSummary: tc.outputSummary,
            durationMs: tc.durationMs,
          });
        }
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
        .set({
          status: "failed",
          currentStage: "failed",
          completedAt: new Date(),
        })
        .where(eq(workflowRunsTable.id, workflowRunId));
      const failedActivity = composeAuditEntry({
        action: "workflow_failed",
        message: `Pipeline failed at stage ${workflowRun?.currentStage ?? "unknown"}: ${String(err)}`,
        actor: "system",
        actorType: "system",
        from: workflowRun?.currentStage ?? "unknown",
        to: "failed",
        change: `status: ${workflowRun?.currentStage ?? "unknown"} → failed`,
        workflowRunId,
        metadata: { lastStage: workflowRun?.currentStage },
      });
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

    // If synthesis ran in this pass we have its NodeResult; otherwise pull
    // the AgentOutput we resumed from state.
    const synthesisOutput =
      synthesisResult?.output ?? state.agentOutputs["synthesis"];
    const fp = fingerprintRequest(request);
    const demoSynthesis = synthesisDemo(request, fp);
    const synthDetails = synthesisOutput?.details ?? demoSynthesis;
    const summary =
      synthesisOutput?.summary && synthesisOutput.summary.length > 0
        ? synthesisOutput.summary
        : typeof synthDetails["summary"] === "string" &&
            (synthDetails["summary"] as string).length > 0
          ? (synthDetails["summary"] as string)
          : ((demoSynthesis["summary"] as string) ?? "");
    const recommendation =
      synthDetails["recommendedDecision"] === "approve"
        ? `Recommend approve: ${summary}`
        : `Recommend reject based on synthesis findings.`;
    const nextActions =
      synthesisOutput?.recommendedActions &&
      synthesisOutput.recommendedActions.length > 0
        ? synthesisOutput.recommendedActions
        : Array.isArray(synthDetails["nextActions"])
          ? (synthDetails["nextActions"] as string[])
          : ((demoSynthesis["nextActions"] as string[]) ?? []);

    state.finalSummary = summary;
    state.finalNextActions = nextActions;
    state.approvalStatus = "pending";

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
    const { workflowRun, request, portfolioCompany } = loaded;

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

    const {
      agentOutputs,
      completedSteps,
      retrievedMemory: hydratedMemory,
      toolCallResults: hydratedToolCalls,
    } = await hydrateState(workflowRunId);
    const stepIndex = completedSteps.length;

    const state: WorkflowState = {
      workflowRun,
      request,
      ...(portfolioCompany ? { portfolioCompany } : {}),
      currentStage: workflowRun.currentStage,
      agentOutputs,
      retrievedMemory: hydratedMemory,
      toolCallResults: hydratedToolCalls,
      riskFlags: Object.values(agentOutputs).flatMap((o) => o.risks),
      approvalStatus: workflowRun.status as "approved" | "rejected",
      finalNextActions: [],
      metadata: { startedAt: workflowRun.startedAt ?? new Date() },
    };

    const ctx: NodeContext = {
      state,
      workflowRun,
      request,
    };
    await executeNode(FINALIZE_NODE, ctx, stepIndex);

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
