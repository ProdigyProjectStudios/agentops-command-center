import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageTransition } from "@/components/PageTransition";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Wrench,
  XCircle,
  Clock,
  AlertTriangle,
  AlertOctagon,
  Sparkles,
  BookOpen,
  Scale,
  ShieldCheck,
  Megaphone,
  GitBranch,
  Flag,
  FileText,
  Target,
} from "lucide-react";
import {
  useGetWorkflow,
  useRunWorkflow,
  useApproveApproval,
  useRejectApproval,
  getGetWorkflowQueryKey,
  type WorkflowRunDetail,
  type AgentStep,
  type ToolCall,
  type ActivityLog,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingState } from "@/components/LoadingState";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorState } from "@/components/ErrorState";
import { useToast } from "@/hooks/use-toast";
import {
  detectRecommendedOutcome,
  formatRelative,
  formatTimestamp,
  formatCurrencyCents,
  recommendedOutcomeBadge,
  recommendedOutcomeLabel,
  workflowStatusBadge,
  workflowStatusLabel,
  riskBadge,
  priorityBadge,
  stepStatusBadge,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { PipelineFlow } from "@/components/PipelineFlow";
import { RagAssessmentPanel } from "@/components/RagAssessmentPanel";

// Pipeline graph: seven user-visible nodes. Synthesis is hidden and rolled
// into the Final Executive Brief.
type NodeKey =
  | "ops_triage"
  | "memory_retrieval"
  | "legal_review"
  | "finance_review"
  | "communications"
  | "approval"
  | "finalize";

const PIPELINE_NODES: Array<{
  key: NodeKey;
  label: string;
  short: string;
  // Step `name` values persisted by the engine for this node.
  matches: string[];
  icon: typeof Bot;
}> = [
  { key: "ops_triage",       label: "Triage & Routing",         short: "Triage",   matches: ["Triage & Routing"],           icon: GitBranch },
  { key: "memory_retrieval", label: "Knowledge Grounding",      short: "Memory",   matches: ["Knowledge Grounding"],        icon: BookOpen },
  { key: "legal_review",     label: "Legal & Compliance",       short: "Legal",    matches: ["Legal & Compliance Review"],  icon: Scale },
  { key: "finance_review",   label: "Finance & Budget",         short: "Finance",  matches: ["Finance & Budget Review"],    icon: ShieldCheck },
  { key: "communications",   label: "Communications Draft",     short: "Comms",    matches: ["Communications Draft"],       icon: Megaphone },
  { key: "approval",         label: "Approval Gate",            short: "Approval", matches: ["Open Approval Gate"],         icon: Flag },
  { key: "finalize",         label: "Finalize Workflow",        short: "Finalize", matches: ["Finalize Workflow"],          icon: CheckCircle2 },
];

// The synthesis node is the canonical source for the final executive brief.
const SYNTHESIS_STEP_NAME = "Risk Synthesis";

// AgentOutput envelope (mirror of the backend type) — only the fields we read.
type FallbackMode = "demo" | "live";
type FallbackReason =
  | "no_credentials"
  | "empty_content"
  | "non_object"
  | "invalid_json"
  | "schema_validation"
  | "shape_mismatch"
  | "api_error";
interface FallbackInfo {
  mode: FallbackMode;
  reason: FallbackReason;
  message: string;
}
interface AgentOutputEnvelope {
  summary?: string;
  findings?: string[];
  risks?: string[];
  recommendedActions?: string[];
  toolCallsRequested?: Array<{ toolName: string; input?: Record<string, unknown>; rationale?: string }>;
  confidence?: number;
  details?: Record<string, unknown>;
  fallback?: FallbackInfo;
}

function parseFallback(v: unknown): FallbackInfo | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const mode = o["mode"];
  const reason = o["reason"];
  const message = o["message"];
  if (
    (mode === "demo" || mode === "live") &&
    typeof reason === "string" &&
    typeof message === "string"
  ) {
    return {
      mode,
      reason: reason as FallbackReason,
      message,
    };
  }
  return undefined;
}

function asEnvelope(output: unknown): AgentOutputEnvelope {
  if (!output || typeof output !== "object") return {};
  const o = output as Record<string, unknown>;
  return {
    summary: typeof o["summary"] === "string" ? (o["summary"] as string) : undefined,
    findings: Array.isArray(o["findings"]) ? (o["findings"] as string[]) : [],
    risks: Array.isArray(o["risks"]) ? (o["risks"] as string[]) : [],
    recommendedActions: Array.isArray(o["recommendedActions"]) ? (o["recommendedActions"] as string[]) : [],
    toolCallsRequested: Array.isArray(o["toolCallsRequested"])
      ? (o["toolCallsRequested"] as AgentOutputEnvelope["toolCallsRequested"])
      : [],
    confidence: typeof o["confidence"] === "number" ? (o["confidence"] as number) : undefined,
    details: (o["details"] as Record<string, unknown>) ?? {},
    fallback: parseFallback(o["fallback"]),
  };
}

function fallbackBadgeClass(mode: FallbackMode): string {
  return mode === "live"
    ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
    : "bg-muted text-muted-foreground border-border";
}

function fallbackShortLabel(mode: FallbackMode): string {
  return mode === "live" ? "Live fallback" : "Demo";
}

// Memory aggregation: read every memory_search tool call and dedupe
// by documentId, keeping the highest-scored hit (matches engine semantics).
interface MemoryHit {
  documentId: number;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

function aggregateMemory(toolCalls: ToolCall[]): MemoryHit[] {
  const byId = new Map<number, MemoryHit>();
  for (const tc of toolCalls) {
    if (tc.toolName !== "memory_search") continue;
    const out = tc.output as { hits?: MemoryHit[] } | undefined;
    for (const h of out?.hits ?? []) {
      const existing = byId.get(h.documentId);
      if (!existing || h.score > existing.score) byId.set(h.documentId, h);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [polling, setPolling] = useState(false);
  const queryKey = getGetWorkflowQueryKey(id);
  const { data: workflow, isLoading, error } = useGetWorkflow(id, {
    query: {
      queryKey,
      refetchInterval: polling ? 1200 : false,
      enabled: Number.isFinite(id),
      retry: false,
    },
  });

  const TERMINAL = useMemo(
    () => new Set(["approval_pending", "approved", "rejected", "finalized", "failed"]),
    [],
  );

  useEffect(() => {
    if (!workflow) return;
    if (polling) {
      if (TERMINAL.has(workflow.status)) setPolling(false);
    } else if (!TERMINAL.has(workflow.status) && workflow.status !== "submitted") {
      setPolling(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow?.status]);

  const runWorkflow = useRunWorkflow({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
      onError: (e) => {
        setPolling(false);
        toast({
          title: "Run failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      },
    },
  });

  // Responsive accordion behavior: single-open on small screens, multi-open on
  // wide screens. By default, expand any node that has produced output.
  // Hooks must run unconditionally, so we compute defaults from `workflow`
  // (which is undefined during loading) and tolerate that.
  const isMobile = useIsMobile();
  const defaultExpanded = useMemo<Set<NodeKey>>(() => {
    const s = new Set<NodeKey>();
    if (!workflow) return s;
    const stepsByName = new Map(workflow.steps.map((st) => [st.name, st]));
    for (const node of PIPELINE_NODES) {
      const step = node.matches.map((m) => stepsByName.get(m)).find(Boolean);
      if (step && (step.status === "completed" || step.status === "failed" || step.status === "running")) {
        s.add(node.key);
      }
    }
    return s;
  }, [workflow]);
  const [expanded, setExpanded] = useState<Set<NodeKey>>(() => new Set());
  // Auto-expand newly-active nodes as the run progresses, but preserve any
  // panel state the user has manually changed and don't reset on every poll.
  // `seenAuto` tracks which nodes we've already auto-expanded once.
  const seenAutoRef = useMemo(() => ({ current: new Set<NodeKey>() }), []);
  useEffect(() => {
    const newlyActive: NodeKey[] = [];
    for (const key of defaultExpanded) {
      if (!seenAutoRef.current.has(key)) newlyActive.push(key);
    }
    if (newlyActive.length === 0) return;
    setExpanded((prev) => {
      const next = isMobile ? new Set<NodeKey>() : new Set(prev);
      for (const key of newlyActive) next.add(key);
      return next;
    });
    for (const key of newlyActive) seenAutoRef.current.add(key);
  }, [defaultExpanded, isMobile, seenAutoRef]);
  const toggleNode = useCallback(
    (key: NodeKey) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          if (isMobile) next.clear();
          next.add(key);
        }
        return next;
      });
    },
    [isMobile],
  );
  const expandNode = useCallback(
    (key: NodeKey) => {
      setExpanded((prev) => {
        if (prev.has(key)) return prev;
        const next = isMobile ? new Set<NodeKey>() : new Set(prev);
        next.add(key);
        return next;
      });
    },
    [isMobile],
  );

  if (!Number.isFinite(id) || error) {
    return (
      <PageTransition>
        <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-2xl mx-auto">
          <ErrorState
            title="Workflow not found"
            description={
              !Number.isFinite(id)
                ? "That workflow ID isn't valid."
                : error instanceof Error
                  ? error.message
                  : "We couldn't load this workflow run."
            }
            testId="workflow-error"
            action={
              <Link href="/workflows" data-testid="link-back-workflows">
                <Button variant="outline" asChild>
                  <span className="cursor-pointer">
                    <ArrowLeft className="size-3" /> Back to workflows
                  </span>
                </Button>
              </Link>
            }
          />
        </div>
      </PageTransition>
    );
  }

  if (isLoading || !workflow) {
    return (
      <PageTransition>
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">
          <LoadingState
            icon={GitBranch}
            title="Loading workflow run"
            description="Reconstructing the agent timeline, tool calls, and audit trail…"
            testId="loading-workflow-detail"
          >
            <div className="space-y-3 mt-2">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          </LoadingState>
        </div>
      </PageTransition>
    );
  }

  const canRun = workflow.status === "submitted" || workflow.status === "failed";

  function handleRun() {
    setPolling(true);
    runWorkflow.mutate({ id });
  }

  // Map each visible pipeline node to its agent_step (if any).
  const stepsByName = new Map(workflow.steps.map((s) => [s.name, s]));
  const nodeStateByKey = new Map<NodeKey, { step?: AgentStep; status: NodeStatus }>();
  let sawFailure = false;
  for (const node of PIPELINE_NODES) {
    const step = node.matches.map((m) => stepsByName.get(m)).find(Boolean);
    let status: NodeStatus;
    if (!step) status = "pending";
    else if (step.status === "completed") status = "completed";
    else if (step.status === "failed") {
      status = "failed";
      sawFailure = true;
    } else if (step.status === "running") status = "running";
    else status = "pending";
    nodeStateByKey.set(node.key, { step, status });
  }
  // Mark all post-failure nodes as skipped.
  if (sawFailure) {
    let past = false;
    for (const node of PIPELINE_NODES) {
      const cur = nodeStateByKey.get(node.key)!;
      if (cur.status === "failed") {
        past = true;
        continue;
      }
      if (past && cur.status === "pending") cur.status = "skipped";
    }
  }

  const synthesisStep = stepsByName.get(SYNTHESIS_STEP_NAME);
  const synthesisEnvelope = synthesisStep ? asEnvelope(synthesisStep.output) : null;

  const memoryHits = aggregateMemory(workflow.toolCalls);

  const isFinalized = workflow.status === "finalized";

  // Build per-node aggregated envelope info for the right-column panels.
  const allRisks: string[] = [];
  const allNextActions: string[] = [];
  for (const step of workflow.steps) {
    const env = asEnvelope(step.output);
    if (env.risks) allRisks.push(...env.risks);
    if (env.recommendedActions) allNextActions.push(...env.recommendedActions);
  }
  const dedupedRisks = Array.from(new Set(allRisks)).slice(0, 8);
  const dedupedActions = Array.from(new Set(allNextActions)).slice(0, 8);

  const commsStep = workflow.steps.find(
    (s) => s.agentSlug === "communications" || /comms|communication/i.test(s.name),
  );
  const commsEnv = commsStep ? asEnvelope(commsStep.output) : null;
  const commsDraft =
    (commsEnv?.details?.["draftMessage"] as string | undefined) ||
    (commsEnv?.details?.["draft"] as string | undefined) ||
    commsEnv?.summary;

  const briefingActiveIdx = (() => {
    let last = -1;
    for (let i = 0; i < PIPELINE_NODES.length; i++) {
      const st = nodeStateByKey.get(PIPELINE_NODES[i].key)!.status;
      if (st === "completed") last = i;
      if (st === "running") return i;
    }
    return last >= 0 ? Math.min(last + 1, PIPELINE_NODES.length - 1) : 0;
  })();

  return (
    <PageTransition>
      <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div>
          <Link
            href="/workflows"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
            data-testid="link-back"
          >
            <ArrowLeft className="size-3" /> All workflows
          </Link>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="eyebrow mb-2">Workflow Run · #{workflow.id}</div>
              <h2
                className="font-display text-3xl sm:text-4xl font-medium tracking-[-0.02em] leading-tight"
                data-testid="text-workflow-title"
              >
                {workflow.request.title}
              </h2>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                <span data-testid="text-company">{workflow.request.portfolioCompanyName}</span>
                <span>·</span>
                <span>{workflow.request.department}</span>
                <span>·</span>
                <span>by {workflow.request.requestedBy}</span>
                <span>·</span>
                <span>{formatRelative(workflow.createdAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <StatusBadge className={priorityBadge(workflow.request.priority)} testId="badge-priority">
                {workflow.request.priority.toUpperCase()}
              </StatusBadge>
              <StatusBadge className={riskBadge(workflow.riskLevel)} testId="badge-risk">
                Risk: {workflow.riskLevel}
              </StatusBadge>
              <StatusBadge className={workflowStatusBadge(workflow.status)} testId="badge-status">
                {workflowStatusLabel(workflow.status)}
              </StatusBadge>
              {canRun && (
                <Button
                  onClick={handleRun}
                  disabled={runWorkflow.isPending || polling}
                  data-testid="button-run-workflow"
                  size="sm"
                >
                  {runWorkflow.isPending || polling ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Running…
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" /> Run Workflow
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Executive briefing — sticky left rail + right column */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 lg:gap-8">
          <aside className="lg:sticky lg:top-6 self-start">
            <LeftRailTimeline
              nodes={PIPELINE_NODES}
              state={nodeStateByKey}
              onSelect={expandNode}
              currentStage={workflow.currentStage}
            />
          </aside>

          <div className="space-y-6 min-w-0">
            {/* Executive brief — synthesized */}
            {(synthesisStep?.status === "completed" || isFinalized) && (
              <FinalExecutiveBrief workflow={workflow} synthesis={synthesisEnvelope} />
            )}

            {/* Request brief — short context summary */}
            <Card className="surface-raised p-5">
              <div className="eyebrow mb-2">Request brief</div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed" data-testid="text-description">
                {workflow.request.description}
              </p>
            </Card>

            {/* Risk & Compliance */}
            <RiskCompliancePanel
              riskLevel={workflow.riskLevel}
              risks={dedupedRisks}
            />

            {/* Cost / Payment */}
            <CostPanel workflow={workflow} memoryHits={memoryHits.length} />

            {/* Drafted Communication */}
            {commsDraft && <DraftedCommsPanel draft={commsDraft} agentName={commsStep?.agentName} />}

            {/* RAG Assessment Panel — live pipeline state from api-python */}
            <RagAssessmentPanel workflowId={id} />

            {/* Approval Decision */}
            {workflow.approval && (
              <ApprovalDecisionSection workflow={workflow} queryKey={queryKey} />
            )}

            {/* Final Next Actions */}
            {dedupedActions.length > 0 && (
              <NextActionsPanel actions={dedupedActions} />
            )}
          </div>
        </div>

        {/* Forensic depth — agent graph, per-node outputs, memory, tools, audit */}
        <section className="space-y-6 pt-4 border-t border-border">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <div className="eyebrow">Forensic depth</div>
              <h3 className="text-lg font-semibold tracking-tight mt-1">Per-agent outputs, tool calls, audit trail</h3>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              Everything below is what the agents actually wrote and called — the full ledger behind the brief above.
            </p>
          </div>

          {/* Agent Graph */}
          <Card className="surface-raised p-5" data-testid="graph-timeline">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-semibold">Agent Graph</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Current stage: <span className="text-foreground">{workflow.currentStage}</span>
                </p>
              </div>
            </div>
            <GraphTimeline nodes={PIPELINE_NODES} state={nodeStateByKey} onSelect={expandNode} />
            <div className="mt-6">
              <PipelineFlow
                nodes={PIPELINE_NODES.map((n) => ({ key: n.key, label: n.label }))}
                activeIndex={briefingActiveIdx}
                completedUntil={
                  PIPELINE_NODES.findIndex(
                    (n) => nodeStateByKey.get(n.key)!.status !== "completed",
                  ) === -1
                    ? PIPELINE_NODES.length
                    : PIPELINE_NODES.findIndex(
                        (n) => nodeStateByKey.get(n.key)!.status !== "completed",
                      )
                }
                showLabels={false}
                ambient={!isFinalized}
                height={70}
                testId="workflow-pipeline-flow"
              />
            </div>
          </Card>

          {/* Two-column forensic */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold px-1">Agent Outputs</h3>
                {workflow.steps.length === 0 && (
                  <Card className="p-8 text-center text-sm text-muted-foreground surface-raised border-dashed" data-testid="empty-agents">
                    No agents have run yet. Click <span className="text-foreground font-medium">Run Workflow</span> to start the pipeline.
                  </Card>
                )}
                <AnimatePresence initial={false}>
                  {PIPELINE_NODES.map((node, idx) => {
                    const entry = nodeStateByKey.get(node.key)!;
                    return (
                      <motion.div
                        key={node.key}
                        id={`agent-${node.key}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1], delay: idx * 0.03 }}
                      >
                        <AgentPanel
                          node={node}
                          step={entry.step}
                          status={entry.status}
                          toolCalls={workflow.toolCalls}
                          expanded={expanded.has(node.key)}
                          onToggle={() => toggleNode(node.key)}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <RetrievedMemorySection hits={memoryHits} />
              <ToolCallsSection toolCalls={workflow.toolCalls} steps={workflow.steps} />
            </div>

            <div className="space-y-6">
              <Card className="surface-raised p-5">
                <div className="eyebrow mb-3">Run snapshot</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost</span>
                    <span className="font-medium tnum" data-testid="text-cost">
                      {formatCurrencyCents(workflow.estimatedCostCents)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk level</span>
                    <StatusBadge className={riskBadge(workflow.riskLevel)}>{workflow.riskLevel}</StatusBadge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agent steps</span>
                    <span className="tnum">{workflow.steps.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tool calls</span>
                    <span className="tnum">{workflow.toolCalls.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Memory hits</span>
                    <span className="tnum">{memoryHits.length}</span>
                  </div>
                </div>
              </Card>

              <AuditLogSidebar activity={workflow.activity} />
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

/* ---------- Briefing-layout helpers ---------- */

function stepDurationMs(step: AgentStep | undefined): number | null {
  if (!step?.startedAt || !step?.completedAt) return null;
  const a = new Date(step.startedAt).getTime();
  const b = new Date(step.completedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, b - a);
}

function formatDurationMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function LeftRailTimeline({
  nodes,
  state,
  onSelect,
  currentStage,
}: {
  nodes: typeof PIPELINE_NODES;
  state: Map<NodeKey, { step?: AgentStep; status: NodeStatus }>;
  onSelect: (k: NodeKey) => void;
  currentStage: string;
}) {
  return (
    <div className="surface-raised p-4" data-testid="left-rail-timeline">
      <div className="eyebrow mb-3">Run timeline</div>
      <ol className="relative">
        <span
          aria-hidden="true"
          className="absolute left-[8px] top-2 bottom-2 w-px bg-border"
        />
        {nodes.map((node) => {
          const entry = state.get(node.key)!;
          const c = nodeColor(entry.status);
          const dur = stepDurationMs(entry.step);
          const isActive = entry.status === "running";
          return (
            <li key={node.key} className="relative pl-6 py-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelect(node.key);
                  const el = document.getElementById(`agent-${node.key}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="w-full text-left flex items-start gap-2 group"
                data-testid={`rail-node-${node.key}`}
              >
                <span
                  className={cn(
                    "absolute left-[2px] top-2.5 size-3 rounded-full border-2 border-background",
                    isActive
                      ? "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]"
                      : entry.status === "completed"
                        ? "bg-primary/80"
                        : entry.status === "failed"
                          ? "bg-rose-400"
                          : entry.status === "skipped"
                            ? "bg-muted"
                            : "bg-muted-foreground/40",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors truncate">
                    {node.label}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground/80 mt-0.5 truncate">
                    {entry.step?.agentName ?? "—"}
                  </div>
                </div>
                <span className={cn("text-[10px] font-mono tnum shrink-0 mt-0.5", c.dot)}>
                  {formatDurationMs(dur)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 pt-3 border-t border-card-border text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
        Stage · <span className="text-foreground">{currentStage}</span>
      </div>
    </div>
  );
}

function RiskCompliancePanel({
  riskLevel,
  risks,
}: {
  riskLevel: WorkflowRunDetail["riskLevel"];
  risks: string[];
}) {
  return (
    <Card className="surface-raised p-5" data-testid="panel-risk-compliance">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">Risk &amp; Compliance</div>
        <StatusBadge className={riskBadge(riskLevel)}>{riskLevel}</StatusBadge>
      </div>
      {risks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No risks flagged by the crew.</p>
      ) : (
        <ul className="space-y-2">
          {risks.map((r, i) => (
            <li
              key={i}
              className="text-sm flex items-start gap-2"
              data-testid={`risk-item-${i}`}
            >
              <AlertTriangle className="size-3.5 text-amber-300 shrink-0 mt-0.5" />
              <span className="text-foreground/90 leading-relaxed">{r}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CostPanel({
  workflow,
  memoryHits,
}: {
  workflow: WorkflowRunDetail;
  memoryHits: number;
}) {
  return (
    <Card className="surface-raised p-5" data-testid="panel-cost">
      <div className="eyebrow mb-3">Cost &amp; Payment</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mb-1">
            Estimated impact
          </div>
          <div className="text-2xl font-display font-medium tnum">
            {formatCurrencyCents(workflow.estimatedCostCents)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mb-1">
            Evidence reviewed
          </div>
          <div className="text-2xl font-display font-medium tnum">{memoryHits}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">policy chunks</div>
        </div>
      </div>
    </Card>
  );
}

function DraftedCommsPanel({
  draft,
  agentName,
}: {
  draft: string;
  agentName?: string;
}) {
  return (
    <Card className="surface-raised p-5" data-testid="panel-drafted-comms">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">Drafted communication</div>
        {agentName && (
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
            via {agentName}
          </span>
        )}
      </div>
      <div className="rounded-md border border-card-border bg-background/40 p-4">
        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
          {draft}
        </p>
      </div>
    </Card>
  );
}

function NextActionsPanel({ actions }: { actions: string[] }) {
  return (
    <Card className="surface-raised p-5" data-testid="panel-next-actions">
      <div className="eyebrow mb-3">Final next actions</div>
      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li
            key={i}
            className="text-sm flex items-start gap-2"
            data-testid={`next-action-${i}`}
          >
            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
            <span className="text-foreground/90 leading-relaxed">{a}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Graph timeline
type NodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

function nodeColor(status: NodeStatus) {
  switch (status) {
    case "completed":
      return {
        ring: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
        edge: "bg-emerald-500/60",
        dot: "text-emerald-300",
      };
    case "running":
      return {
        ring: "border-sky-500/50 bg-sky-500/10 text-sky-100 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]",
        edge: "bg-sky-500/50",
        dot: "text-sky-300",
      };
    case "failed":
      return {
        ring: "border-rose-500/50 bg-rose-500/10 text-rose-200",
        edge: "bg-rose-500/50",
        dot: "text-rose-300",
      };
    case "skipped":
      return {
        ring: "border-border bg-muted/30 text-muted-foreground opacity-50",
        edge: "bg-muted",
        dot: "text-muted-foreground",
      };
    default:
      return {
        ring: "border-border bg-card text-muted-foreground",
        edge: "bg-muted",
        dot: "text-muted-foreground",
      };
  }
}

function GraphTimeline({
  nodes,
  state,
  onSelect,
}: {
  nodes: typeof PIPELINE_NODES;
  state: Map<NodeKey, { step?: AgentStep; status: NodeStatus }>;
  onSelect: (key: NodeKey) => void;
}) {
  function scrollToNode(key: NodeKey) {
    onSelect(key);
    requestAnimationFrame(() => {
      const el = document.getElementById(`agent-${key}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
      {nodes.map((node, i) => {
        const entry = state.get(node.key)!;
        const c = nodeColor(entry.status);
        const Icon = node.icon;
        const next = i < nodes.length - 1 ? state.get(nodes[i + 1]!.key)! : null;
        const edgeStatus = entry.status === "completed" ? "completed" : entry.status;
        const edge = nodeColor(edgeStatus).edge;
        return (
          <div key={node.key} className="flex items-center min-w-0 flex-1">
            <motion.button
              onClick={() => scrollToNode(node.key)}
              data-testid={`graph-node-${node.key}`}
              data-status={entry.status}
              initial={false}
              animate={{ scale: entry.status === "running" ? [1, 1.04, 1] : 1 }}
              transition={
                entry.status === "running"
                  ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.25 }
              }
              className={cn(
                "flex flex-col items-center gap-1.5 px-2 py-2 rounded-lg border transition-colors min-w-0 flex-1 cursor-pointer hover-elevate",
                c.ring,
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {entry.status === "running" ? (
                  <Loader2 className={cn("size-3.5 animate-spin shrink-0", c.dot)} />
                ) : entry.status === "failed" ? (
                  <XCircle className={cn("size-3.5 shrink-0", c.dot)} />
                ) : entry.status === "completed" ? (
                  <CheckCircle2 className={cn("size-3.5 shrink-0", c.dot)} />
                ) : (
                  <Icon className={cn("size-3.5 shrink-0", c.dot)} />
                )}
                <span className="text-[11px] font-medium truncate">{node.short}</span>
              </div>
              <span className="text-[9px] uppercase tracking-wider opacity-70">
                {entry.status}
              </span>
            </motion.button>
            {next && (
              <div
                className={cn("h-px w-3 sm:w-5 shrink-0 transition-colors", edge)}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Agent detail panel with tabs over the AgentOutput envelope
function AgentPanel({
  node,
  step,
  status,
  toolCalls,
  expanded,
  onToggle,
}: {
  node: (typeof PIPELINE_NODES)[number];
  step?: AgentStep;
  status: NodeStatus;
  toolCalls: ToolCall[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const env = step ? asEnvelope(step.output) : {};
  const stepToolCalls = step ? toolCalls.filter((tc) => tc.agentStepId === step.id) : [];
  const hasOutput = step && (status === "completed" || status === "failed");
  const NodeIcon = node.icon;

  return (
    <Card
      className={cn(
        "bg-card border-card-border overflow-hidden transition-colors",
        status === "running" && "border-sky-500/40",
        status === "failed" && "border-rose-500/40",
        status === "skipped" && "opacity-60",
      )}
      data-testid={`agent-panel-${node.key}`}
      data-status={status}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`agent-body-${node.key}`}
        className="w-full p-4 flex items-start gap-3 text-left hover-elevate"
        data-testid={`agent-header-${node.key}`}
      >
        <div
          className={cn(
            "size-9 rounded-md flex items-center justify-center shrink-0",
            status === "completed" && "bg-emerald-500/15 text-emerald-300",
            status === "running" && "bg-sky-500/15 text-sky-300",
            status === "failed" && "bg-rose-500/15 text-rose-300",
            (status === "pending" || status === "skipped") && "bg-muted text-muted-foreground",
          )}
        >
          {status === "running" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : status === "failed" ? (
            <XCircle className="size-4" />
          ) : status === "completed" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <NodeIcon className="size-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {step && (
              <span className="text-xs text-muted-foreground tabular-nums">#{step.stepIndex + 1}</span>
            )}
            <span className="text-sm font-medium" data-testid={`agent-name-${node.key}`}>
              {step?.agentName ?? node.label}
            </span>
            <StatusBadge
              className={stepStatusBadge(step?.status ?? (status === "skipped" ? "pending" : status))}
            >
              {step?.status ?? status}
            </StatusBadge>
            {step?.confidence != null && (
              <span className="text-[11px] text-muted-foreground">
                conf {Math.round(Number(step.confidence) * 100)}%
              </span>
            )}
            {stepToolCalls.length > 0 && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Wrench className="size-3" />
                {stepToolCalls.length} tool call{stepToolCalls.length !== 1 ? "s" : ""}
              </span>
            )}
            {env.fallback && (
              <span
                title={env.fallback.message}
                aria-label={env.fallback.message}
                className={cn(
                  "text-[10px] px-1.5 py-px rounded border font-medium inline-flex items-center gap-1",
                  fallbackBadgeClass(env.fallback.mode),
                )}
                data-testid={`badge-fallback-${node.key}`}
                data-fallback-mode={env.fallback.mode}
                data-fallback-reason={env.fallback.reason}
              >
                {env.fallback.mode === "live" ? (
                  <AlertOctagon className="size-3" />
                ) : (
                  <Bot className="size-3" />
                )}
                {fallbackShortLabel(env.fallback.mode)}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{node.label}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {step && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {step.completedAt
                ? formatRelative(step.completedAt)
                : step.startedAt
                  ? formatRelative(step.startedAt)
                  : "—"}
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {expanded && (
        <div id={`agent-body-${node.key}`} className="border-t border-card-border">
          {hasOutput ? (
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b border-card-border bg-card/40 px-4 h-auto py-1.5 gap-0.5 overflow-x-auto">
                <TabsTrigger value="summary" className="text-xs" data-testid={`tab-summary-${node.key}`}>Summary</TabsTrigger>
                <TabsTrigger value="findings" className="text-xs">
                  Findings{env.findings && env.findings.length > 0 ? ` (${env.findings.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="risks" className="text-xs">
                  Risks{env.risks && env.risks.length > 0 ? ` (${env.risks.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="actions" className="text-xs">
                  Actions{env.recommendedActions && env.recommendedActions.length > 0 ? ` (${env.recommendedActions.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="tools" className="text-xs">
                  Tool Calls{stepToolCalls.length > 0 ? ` (${stepToolCalls.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="raw" className="text-xs">Raw JSON</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="px-4 py-4 m-0 space-y-3">
                {env.fallback && (
                  <div
                    className={cn(
                      "flex items-start gap-2 text-xs rounded border px-3 py-2",
                      env.fallback.mode === "live"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                    data-testid={`fallback-note-${node.key}`}
                  >
                    {env.fallback.mode === "live" ? (
                      <AlertOctagon className="size-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <Bot className="size-3.5 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">
                        {env.fallback.mode === "live"
                          ? "Live model fallback"
                          : "Demo-mode output"}
                        <span className="text-[10px] uppercase tracking-wider ml-2 opacity-70">
                          {env.fallback.reason.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="opacity-90 whitespace-pre-wrap">
                        {env.fallback.message}
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-sm text-foreground/90 whitespace-pre-wrap" data-testid={`summary-${node.key}`}>
                  {env.summary || step!.reasoningSummary || "No summary produced."}
                </p>
              </TabsContent>

              <TabsContent value="findings" className="px-4 py-4 m-0">
                <BulletList items={env.findings ?? []} icon={FileText} testIdPrefix={`finding-${node.key}`} emptyText="No findings." />
              </TabsContent>

              <TabsContent value="risks" className="px-4 py-4 m-0">
                <BulletList items={env.risks ?? []} icon={AlertTriangle} testIdPrefix={`risk-${node.key}`} emptyText="No risks flagged." iconClass="text-amber-300" />
              </TabsContent>

              <TabsContent value="actions" className="px-4 py-4 m-0">
                <BulletList items={env.recommendedActions ?? []} icon={Target} testIdPrefix={`action-${node.key}`} emptyText="No recommended actions." iconClass="text-primary" />
              </TabsContent>

              <TabsContent value="tools" className="px-4 py-4 m-0 space-y-2">
                {stepToolCalls.length === 0 && (
                  <p className="text-xs text-muted-foreground">No tool calls recorded for this agent.</p>
                )}
                {stepToolCalls.map((tc) => (
                  <ToolCallRow key={tc.id} tc={tc} compact />
                ))}
              </TabsContent>

              <TabsContent value="raw" className="px-4 py-4 m-0">
                <RawJsonBlock value={step!.output} testId={`raw-${node.key}`} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="px-4 py-6 text-xs text-muted-foreground" data-testid={`agent-pending-${node.key}`}>
              {status === "running"
                ? "Agent is working…"
                : status === "skipped"
                  ? "Skipped due to upstream failure."
                  : "Waiting for upstream agents."}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function BulletList({
  items,
  icon: Icon,
  iconClass,
  testIdPrefix,
  emptyText,
}: {
  items: string[];
  icon: typeof FileText;
  iconClass?: string;
  testIdPrefix: string;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="text-sm flex items-start gap-2" data-testid={`${testIdPrefix}-${i}`}>
          <Icon className={cn("size-3.5 shrink-0 mt-0.5 text-muted-foreground", iconClass)} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// Lightweight JSON syntax highlighter (no external dep). Tokenises strings,
// numbers, booleans/null, and keys, then renders them with semantic color
// classes. Safe-by-construction: tokens are only produced from JSON.stringify
// output (or a string the caller explicitly opted-in), so React's default
// escaping handles arbitrary user content.
function highlightJson(src: string): React.ReactNode {
  const tokenRe =
    /("(?:\\.|[^"\\])*"\s*:?)|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = tokenRe.exec(src)) !== null) {
    if (match.index > last) parts.push(src.slice(last, match.index));
    const [raw, str, lit, num, punct] = match;
    if (str !== undefined) {
      const isKey = str.endsWith(":") || /"\s*:$/.test(str);
      parts.push(
        <span key={i++} className={isKey ? "text-sky-300" : "text-emerald-300"}>
          {str}
        </span>,
      );
    } else if (lit !== undefined) {
      parts.push(
        <span key={i++} className="text-amber-300">
          {lit}
        </span>,
      );
    } else if (num !== undefined) {
      parts.push(
        <span key={i++} className="text-fuchsia-300">
          {num}
        </span>,
      );
    } else if (punct !== undefined) {
      parts.push(
        <span key={i++} className="text-muted-foreground">
          {punct}
        </span>,
      );
    } else {
      parts.push(raw);
    }
    last = match.index + raw.length;
  }
  if (last < src.length) parts.push(src.slice(last));
  return parts;
}

function RawJsonBlock({
  value,
  testId,
  defaultOpen = false,
}: {
  value: unknown;
  testId?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  let body: string;
  try {
    body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    body = String(value);
  }
  const lineCount = body ? body.split("\n").length : 0;
  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid={testId}>
      <CollapsibleTrigger
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded border border-border bg-background/40 hover-elevate text-left"
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        <span className="inline-flex items-center gap-2 text-xs font-mono">
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Raw JSON
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 text-xs font-mono bg-background/60 border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-96 leading-relaxed">
          {body ? highlightJson(body) : "—"}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Retrieved memory
function RetrievedMemorySection({ hits }: { hits: MemoryHit[] }) {
  if (hits.length === 0) return null;
  return (
    <Card className="p-5 bg-card border-card-border" data-testid="section-retrieved-memory">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Retrieved Memory</h3>
        <span className="text-[11px] text-muted-foreground">
          {hits.length} document{hits.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {hits.map((h) => (
          <Link
            key={h.documentId}
            href={`/knowledge?doc=${h.documentId}`}
            className="block p-3 rounded border border-border hover-elevate bg-card/60"
            data-testid={`memory-hit-${h.documentId}`}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{h.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span className="px-1.5 py-px rounded bg-muted">{h.category}</span>
                  <span>score {h.score.toFixed(2)}</span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{h.snippet}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// Tool calls section
function ToolCallsSection({
  toolCalls,
  steps,
}: {
  toolCalls: ToolCall[];
  steps: AgentStep[];
}) {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const sorted = useMemo(
    () => [...toolCalls].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [toolCalls],
  );
  if (sorted.length === 0) return null;
  return (
    <Card className="p-5 bg-card border-card-border" data-testid="section-tool-calls">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Tool Calls</h3>
        <span className="text-[11px] text-muted-foreground">
          {sorted.length} call{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {sorted.map((tc) => (
          <ToolCallRow
            key={tc.id}
            tc={tc}
            agentName={tc.agentStepId ? stepById.get(tc.agentStepId)?.agentName : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

function ToolCallRow({
  tc,
  agentName,
  compact,
}: {
  tc: ToolCall;
  agentName?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const statusClass =
    tc.status === "success"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : tc.status === "failed"
        ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
        : "bg-sky-500/15 text-sky-300 border-sky-500/30";
  const inputPreview = useMemo(() => {
    try {
      const s = JSON.stringify(tc.input ?? {});
      return s.length > 80 ? s.slice(0, 77) + "…" : s;
    } catch {
      return "";
    }
  }, [tc.input]);
  return (
    <div className="border border-border rounded bg-card/60" data-testid={`tool-call-${tc.id}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-col gap-1 px-3 py-2 text-left hover-elevate rounded"
      >
        <div className="flex items-center gap-2 w-full">
          {open ? (
            <ChevronDown className="size-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground shrink-0" />
          )}
          <Wrench className="size-3 text-primary shrink-0" />
          <code className="text-xs font-mono shrink-0">{tc.toolName}</code>
          {agentName && !compact && (
            <span className="text-[11px] text-muted-foreground truncate">{agentName}</span>
          )}
          <span className="flex-1 text-xs text-muted-foreground truncate">{tc.outputSummary}</span>
          <StatusBadge className={statusClass}>{tc.status}</StatusBadge>
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{tc.durationMs}ms</span>
        </div>
        {!open && inputPreview && (
          <div className="pl-6 pr-2 flex items-center gap-2 text-[11px] text-muted-foreground/80 font-mono w-full">
            <span className="uppercase tracking-wider text-[9px] shrink-0">in</span>
            <span className="truncate">{inputPreview}</span>
          </div>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {formatTimestamp(tc.createdAt)}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Input</div>
            <RawJsonBlock value={tc.input} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Output</div>
            <RawJsonBlock value={tc.output} />
          </div>
        </div>
      )}
    </div>
  );
}

// Approval Decision section
function ApprovalDecisionSection({
  workflow,
  queryKey,
}: {
  workflow: WorkflowRunDetail;
  queryKey: readonly unknown[];
}) {
  const approval = workflow.approval!;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [decidedBy, setDecidedBy] = useState("Operator");
  const [note, setNote] = useState("");

  const approve = useApproveApproval({
    mutation: {
      onSuccess: () => {
        toast({ title: "Approved", description: "Workflow finalized." });
        queryClient.invalidateQueries({ queryKey });
      },
    },
  });
  const reject = useRejectApproval({
    mutation: {
      onSuccess: () => {
        toast({ title: "Rejected", description: "Workflow closed as rejected." });
        queryClient.invalidateQueries({ queryKey });
      },
    },
  });

  const decided = approval.status !== "pending";
  const isApproved = approval.status === "approved";
  const isRejected = approval.status === "rejected";

  return (
    <Card
      className={cn(
        "p-5 bg-card border-card-border",
        approval.status === "pending" && "border-amber-500/40 bg-amber-500/[0.03]",
        isApproved && "border-emerald-500/30",
        isRejected && "border-rose-500/30",
      )}
      data-testid="section-approval-decision"
    >
      <div className="flex items-center gap-2 mb-3">
        {approval.status === "pending" ? (
          <Clock className="size-4 text-amber-300" />
        ) : isApproved ? (
          <CheckCircle2 className="size-4 text-emerald-300" />
        ) : (
          <XCircle className="size-4 text-rose-300" />
        )}
        <h3 className="text-sm font-semibold">Approval Decision</h3>
        <StatusBadge className={riskBadge(approval.riskLevel)}>{approval.riskLevel}</StatusBadge>
        <StatusBadge
          className={cn(
            "ml-auto",
            approval.status === "pending" && "bg-amber-500/15 text-amber-300 border-amber-500/30",
            isApproved && "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
            isRejected && "bg-rose-500/15 text-rose-300 border-rose-500/30",
          )}
          testId="badge-approval-status"
        >
          {approval.status}
        </StatusBadge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Summary</div>
          <p className="text-sm" data-testid="text-approval-summary">{approval.summary}</p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Recommendation</div>
          <p className="text-sm" data-testid="text-approval-recommendation">{approval.recommendation}</p>
        </div>
      </div>

      {decided ? (
        <div className="pt-3 border-t border-border space-y-1">
          <div className="text-xs">
            <span className="text-muted-foreground">Decided by </span>
            <span className="font-medium" data-testid="text-decided-by">{approval.decidedBy ?? "—"}</span>
            <span className="text-muted-foreground"> · {formatTimestamp(approval.decidedAt)}</span>
          </div>
          {approval.decisionNote && (
            <p className="text-xs text-muted-foreground italic" data-testid="text-decision-note">
              "{approval.decisionNote}"
            </p>
          )}
        </div>
      ) : (
        <div className="pt-3 border-t border-border space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="approver" className="text-xs">Decided By</Label>
              <Input
                id="approver"
                value={decidedBy}
                onChange={(e) => setDecidedBy(e.target.value)}
                className="mt-1"
                data-testid="input-approver"
              />
            </div>
            <div>
              <Label htmlFor="note" className="text-xs">Note (optional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={1}
                className="mt-1"
                data-testid="input-note"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              disabled={reject.isPending || approve.isPending}
              onClick={() => reject.mutate({ id: approval.id, data: { decidedBy, note } })}
              data-testid="button-reject"
            >
              {reject.isPending ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
              Reject
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={approve.isPending || reject.isPending}
              onClick={() => approve.mutate({ id: approval.id, data: { decidedBy, note } })}
              data-testid="button-approve"
            >
              {approve.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              Approve
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Final Executive Brief — board-ready, sourced from synthesis + workflow.
function FinalExecutiveBrief({
  workflow,
  synthesis,
}: {
  workflow: WorkflowRunDetail;
  synthesis: AgentOutputEnvelope | null;
}) {
  const summary = workflow.summary || synthesis?.summary || "Workflow finalized.";
  const recommendation =
    workflow.finalRecommendation ||
    (synthesis?.details?.["recommendedDecision"] as string | undefined) ||
    "—";
  const recommendedOutcome = detectRecommendedOutcome(recommendation);
  const nextActions =
    workflow.nextActions.length > 0
      ? workflow.nextActions
      : synthesis?.recommendedActions ?? [];
  const keyEvidence = (synthesis?.details?.["keyEvidence"] as string[] | undefined) ?? synthesis?.findings ?? [];

  return (
    <Card
      className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-card border-primary/40 shadow-lg"
      data-testid="section-final-brief"
    >
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-base font-semibold tracking-tight">Final Executive Brief</h3>
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">
        Prepared by Ops Conductor · {formatTimestamp(workflow.completedAt)}
      </div>

      <div className="space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Executive summary</div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="brief-summary">{summary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2 flex-wrap">
              <span>Recommendation</span>
              {recommendedOutcome && (
                <StatusBadge
                  className={recommendedOutcomeBadge(recommendedOutcome)}
                  testId="badge-recommended-outcome"
                >
                  {recommendedOutcome === "conditional_approve" ? (
                    <AlertTriangle className="size-3" />
                  ) : recommendedOutcome === "approve" ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <XCircle className="size-3" />
                  )}
                  {recommendedOutcomeLabel(recommendedOutcome)}
                </StatusBadge>
              )}
            </div>
            <p className="text-sm font-medium" data-testid="brief-recommendation">{recommendation}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Risk posture</div>
            <div className="flex items-center gap-2">
              <StatusBadge className={riskBadge(workflow.riskLevel)} testId="brief-risk">
                {workflow.riskLevel}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">
                {(synthesis?.risks?.length ?? 0)} flag{(synthesis?.risks?.length ?? 0) !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {keyEvidence.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Key evidence</div>
            <ul className="space-y-1.5">
              {keyEvidence.slice(0, 5).map((e, i) => (
                <li key={i} className="text-sm flex items-start gap-2" data-testid={`brief-evidence-${i}`}>
                  <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {nextActions.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Next actions</div>
            <ul className="space-y-1.5">
              {nextActions.map((action, i) => (
                <li key={i} className="text-sm flex items-start gap-2" data-testid={`brief-next-action-${i}`}>
                  <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

// Audit log sidebar
function AuditLogSidebar({ activity }: { activity: ActivityLog[] }) {
  return (
    <Card className="p-5 bg-card border-card-border">
      <h3 className="text-sm font-semibold mb-3">Audit Log</h3>
      <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
        {activity.map((a) => (
          <div
            key={a.id}
            className="text-xs border-l-2 border-border pl-3 py-0.5"
            data-testid={`audit-${a.id}`}
          >
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                {formatTimestamp(a.createdAt)}
              </span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-px rounded border font-medium",
                  a.actorType === "agent"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : a.actorType === "operator"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {a.actor}
              </span>
            </div>
            <div className="text-foreground/90 leading-snug whitespace-pre-wrap">{a.message}</div>
            {(typeof a.metadata?.from === "string" || typeof a.metadata?.to === "string") && (
              <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                {String(a.metadata.from ?? "—")} → {String(a.metadata.to ?? "—")}
              </div>
            )}
          </div>
        ))}
        {activity.length === 0 && (
          <div className="text-xs text-muted-foreground">No activity yet.</div>
        )}
      </div>
    </Card>
  );
}
