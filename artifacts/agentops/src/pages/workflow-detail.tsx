import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
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
  Sparkles,
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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import {
  formatRelative,
  formatTimestamp,
  formatCurrencyCents,
  workflowStatusBadge,
  workflowStatusLabel,
  riskBadge,
  priorityBadge,
  stepStatusBadge,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const PIPELINE_LABELS = [
  "Triage",
  "Legal Review",
  "Finance Review",
  "Comms Draft",
  "Risk Compliance",
  "Approval Routing",
  "Audit Trail",
  "Finalize",
];

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [polling, setPolling] = useState(false);
  const queryKey = getGetWorkflowQueryKey(id);
  const { data: workflow, isLoading } = useGetWorkflow(id, {
    query: {
      queryKey,
      refetchInterval: polling ? 1200 : false,
      enabled: Number.isFinite(id),
    },
  });

  const TERMINAL = new Set([
    "approval_pending",
    "approved",
    "rejected",
    "finalized",
    "failed",
  ]);

  // Auto-resume polling if the workflow is mid-flight when we land on the page.
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
      },
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

  if (isLoading || !workflow) {
    return (
      <div className="px-8 py-8 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-72 mb-4" />
        <Skeleton className="h-32 w-full mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const canRun = workflow.status === "submitted" || workflow.status === "failed";

  function handleRun() {
    setPolling(true);
    runWorkflow.mutate({ id });
  }

  const stepsByIndex = new Map(workflow.steps.map((s) => [s.stepIndex, s]));

  return (
    <div className="px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
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
            <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-workflow-title">
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
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge className={priorityBadge(workflow.request.priority)} testId="badge-priority">
              {workflow.request.priority.toUpperCase()}
            </StatusBadge>
            <StatusBadge className={riskBadge(workflow.riskLevel)} testId="badge-risk">
              Risk: {workflow.riskLevel}
            </StatusBadge>
            <StatusBadge className={workflowStatusBadge(workflow.status)} testId="badge-status">
              {workflowStatusLabel(workflow.status)}
            </StatusBadge>
          </div>
        </div>
      </div>

      {/* Pipeline timeline bar */}
      <Card className="p-5 bg-card border-card-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Agent Pipeline</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Current stage: <span className="text-foreground">{workflow.currentStage}</span>
            </p>
          </div>
          {canRun && (
            <Button
              onClick={handleRun}
              disabled={runWorkflow.isPending || polling}
              data-testid="button-run-workflow"
            >
              {runWorkflow.isPending || polling ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Running agents…
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Run Workflow
                </>
              )}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {PIPELINE_LABELS.map((label, idx) => {
            const step = stepsByIndex.get(idx);
            const status = step?.status;
            const done = status === "completed";
            const failed = status === "failed";
            const running = status === "running";
            return (
              <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-center gap-1">
                  <div
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      done && "bg-emerald-400/80",
                      running && "bg-sky-400/80 animate-pulse",
                      failed && "bg-rose-400/80",
                      !status && "bg-muted",
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wide truncate w-full text-center",
                    done && "text-emerald-300",
                    running && "text-sky-300",
                    failed && "text-rose-300",
                    !status && "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Request brief */}
          <Card className="p-5 bg-card border-card-border">
            <h3 className="text-sm font-semibold mb-2">Request Brief</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-description">
              {workflow.request.description}
            </p>
          </Card>

          {/* Agent step cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold px-1">Agent Outputs</h3>
            {workflow.steps.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground bg-card border-card-border border-dashed">
                No agents have run yet. Click <span className="text-foreground font-medium">Run Workflow</span> to start the pipeline.
              </Card>
            )}
            {workflow.steps.map((step) => (
              <AgentStepCard key={step.id} step={step} toolCalls={workflow.toolCalls} />
            ))}
          </div>

          {/* Final recommendation */}
          {workflow.finalRecommendation && (
            <Card className="p-5 bg-gradient-to-br from-primary/10 to-card border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Final Recommendation</h3>
              </div>
              <p className="text-sm whitespace-pre-wrap mb-4" data-testid="text-final-recommendation">
                {workflow.finalRecommendation}
              </p>
              {workflow.nextActions.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Next Actions
                  </div>
                  <ul className="space-y-1.5">
                    {workflow.nextActions.map((action, idx) => (
                      <li key={idx} className="text-sm flex items-start gap-2" data-testid={`next-action-${idx}`}>
                        <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Approval block */}
          {workflow.approval && (
            <ApprovalBlock workflow={workflow} queryKey={queryKey} />
          )}

          {/* Cost summary */}
          <Card className="p-5 bg-card border-card-border">
            <h3 className="text-sm font-semibold mb-3">Estimated Impact</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-medium tabular-nums" data-testid="text-cost">
                  {formatCurrencyCents(workflow.estimatedCostCents)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Risk Level</span>
                <StatusBadge className={riskBadge(workflow.riskLevel)}>
                  {workflow.riskLevel}
                </StatusBadge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent Steps</span>
                <span className="tabular-nums">{workflow.steps.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tool Calls</span>
                <span className="tabular-nums">{workflow.toolCalls.length}</span>
              </div>
            </div>
          </Card>

          {/* Activity log */}
          <Card className="p-5 bg-card border-card-border">
            <h3 className="text-sm font-semibold mb-3">Audit Log</h3>
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {workflow.activity.map((a) => (
                <div key={a.id} className="text-xs flex gap-2" data-testid={`audit-${a.id}`}>
                  <div className="text-muted-foreground tabular-nums shrink-0">
                    {formatTimestamp(a.createdAt)}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-foreground">{a.actor}</span>
                    <span className="text-muted-foreground"> {a.message}</span>
                  </div>
                </div>
              ))}
              {workflow.activity.length === 0 && (
                <div className="text-xs text-muted-foreground">No activity yet.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AgentStepCard({ step, toolCalls }: { step: AgentStep; toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  const stepToolCalls = toolCalls.filter((tc) => tc.agentStepId === step.id);
  const completed = step.status === "completed";
  const failed = step.status === "failed";
  const running = step.status === "running";

  const outputText = formatJsonish(step.output);
  const inputText = formatJsonish(step.input);

  return (
    <Card
      className={cn(
        "bg-card border-card-border overflow-hidden transition-colors",
        running && "border-sky-500/40",
        failed && "border-rose-500/40",
      )}
      data-testid={`step-card-${step.id}`}
    >
      <div className="p-4 flex items-start gap-3">
        <div
          className={cn(
            "size-9 rounded-md flex items-center justify-center shrink-0",
            completed && "bg-emerald-500/15 text-emerald-300",
            running && "bg-sky-500/15 text-sky-300",
            failed && "bg-rose-500/15 text-rose-300",
            step.status === "pending" && "bg-muted text-muted-foreground",
          )}
        >
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : failed ? (
            <XCircle className="size-4" />
          ) : completed ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Bot className="size-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground tabular-nums">
              #{step.stepIndex + 1}
            </span>
            <span className="text-sm font-medium" data-testid={`step-name-${step.id}`}>
              {step.agentName}
            </span>
            <StatusBadge className={stepStatusBadge(step.status)}>
              {step.status}
            </StatusBadge>
            {step.confidence && (
              <span className="text-[11px] text-muted-foreground">
                conf {Math.round(Number(step.confidence) * 100)}%
              </span>
            )}
            {step.toolsUsed.length > 0 && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Wrench className="size-3" />
                {step.toolsUsed.length} tool{step.toolsUsed.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{step.name}</div>
          {step.reasoningSummary && (
            <p className="text-sm mt-2 text-foreground/90" data-testid={`step-reasoning-${step.id}`}>
              {step.reasoningSummary}
            </p>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-xs text-primary inline-flex items-center gap-1 hover:underline"
            data-testid={`button-expand-step-${step.id}`}
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {expanded ? "Hide details" : "Show input, output & tool calls"}
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {step.completedAt ? formatRelative(step.completedAt) : step.startedAt ? formatRelative(step.startedAt) : "—"}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-card-border bg-background/40 px-4 py-3 space-y-3">
          {step.toolsUsed.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {step.toolsUsed.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <DetailBlock label="Input" content={inputText} testId={`step-input-${step.id}`} />
          <DetailBlock label="Output" content={outputText} testId={`step-output-${step.id}`} />

          {stepToolCalls.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Tool Calls
              </div>
              <div className="space-y-2">
                {stepToolCalls.map((tc) => (
                  <div
                    key={tc.id}
                    className="border border-border rounded p-2.5 bg-card/60"
                    data-testid={`tool-call-${tc.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Wrench className="size-3 text-primary" />
                        <code className="text-xs font-mono">{tc.toolName}</code>
                        <StatusBadge
                          className={cn(
                            tc.status === "success" && "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                            tc.status === "failed" && "bg-rose-500/15 text-rose-300 border-rose-500/30",
                            tc.status === "running" && "bg-sky-500/15 text-sky-300 border-sky-500/30",
                          )}
                        >
                          {tc.status}
                        </StatusBadge>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {tc.durationMs}ms
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{tc.outputSummary}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DetailBlock({
  label,
  content,
  testId,
}: {
  label: string;
  content: string;
  testId?: string;
}) {
  if (!content) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <pre
        data-testid={testId}
        className="text-xs font-mono bg-card/60 border border-border rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-64"
      >
        {content}
      </pre>
    </div>
  );
}

function ApprovalBlock({
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
      data-testid="block-approval"
    >
      <div className="flex items-center gap-2 mb-3">
        {approval.status === "pending" ? (
          <Clock className="size-4 text-amber-300" />
        ) : isApproved ? (
          <CheckCircle2 className="size-4 text-emerald-300" />
        ) : isRejected ? (
          <XCircle className="size-4 text-rose-300" />
        ) : (
          <AlertTriangle className="size-4 text-sky-300" />
        )}
        <h3 className="text-sm font-semibold">
          Human Approval
        </h3>
        <StatusBadge className={riskBadge(approval.riskLevel)}>
          {approval.riskLevel}
        </StatusBadge>
      </div>

      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
        Summary
      </div>
      <p className="text-sm mb-3" data-testid="text-approval-summary">{approval.summary}</p>

      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
        Recommendation
      </div>
      <p className="text-sm mb-4" data-testid="text-approval-recommendation">
        {approval.recommendation}
      </p>

      {decided ? (
        <div className="space-y-2 pt-3 border-t border-border">
          <div className="text-xs">
            <span className="text-muted-foreground">Decided by </span>
            <span className="font-medium" data-testid="text-decided-by">{approval.decidedBy ?? "—"}</span>
            <span className="text-muted-foreground"> · {formatRelative(approval.decidedAt)}</span>
          </div>
          {approval.decisionNote && (
            <p className="text-xs text-muted-foreground italic" data-testid="text-decision-note">
              "{approval.decisionNote}"
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 pt-3 border-t border-border">
          <div className="grid grid-cols-1 gap-2">
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
                rows={2}
                className="mt-1"
                data-testid="input-note"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              disabled={reject.isPending || approve.isPending}
              onClick={() =>
                reject.mutate({ id: approval.id, data: { decidedBy, note } })
              }
              data-testid="button-reject"
            >
              {reject.isPending ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
              Reject
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={approve.isPending || reject.isPending}
              onClick={() =>
                approve.mutate({ id: approval.id, data: { decidedBy, note } })
              }
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

function formatJsonish(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
