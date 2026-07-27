/**
 * RAG Assessment Panel
 *
 * Shows the live pipeline-state for a workflow run fetched from api-python:
 *   • Workflow job status
 *   • Assessment attempt count
 *   • Evidence chunks retrieved (with excerpt)
 *   • Confidence score (colour-coded bar)
 *   • Routing decision (auto_complete vs approval_gate)
 *   • Approval request status (if one exists)
 *   • Background job queue entries (if any)
 *
 * Data source: GET /api-python/pipeline-state/{workflowId}
 * Hook: useRagPipelineState() from @/lib/api-python-client
 */

import { Brain, CheckCircle2, Clock, AlertTriangle, XCircle, ShieldAlert, Layers, ListChecks, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { useRagPipelineState, type AssessmentSummary, type ApprovalSummary, type JobSummary } from "@/lib/api-python-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceBar(score: number) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.75
      ? "bg-emerald-500"
      : score >= 0.5
        ? "bg-amber-400"
        : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-mono font-semibold tabular-nums", score >= 0.75 ? "text-emerald-400" : score >= 0.5 ? "text-amber-400" : "text-rose-400")}>
        {pct}%
      </span>
    </div>
  );
}

function routingBadge(routing: string) {
  if (routing === "auto_complete") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium">
        <Zap className="size-3" /> Auto-complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 font-medium">
      <ShieldAlert className="size-3" /> Approval gate
    </span>
  );
}

function approvalStatusBadge(status: string) {
  if (status === "approved") {
    return (
      <StatusBadge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
        <CheckCircle2 className="size-3" /> Approved
      </StatusBadge>
    );
  }
  if (status === "rejected") {
    return (
      <StatusBadge className="bg-rose-500/15 text-rose-300 border-rose-500/40">
        <XCircle className="size-3" /> Rejected
      </StatusBadge>
    );
  }
  return (
    <StatusBadge className="bg-amber-500/15 text-amber-300 border-amber-500/40">
      <Clock className="size-3" /> Pending
    </StatusBadge>
  );
}

function jobStatusBadge(status: string) {
  if (status === "done") return <span className="text-[10px] text-emerald-400 font-medium">done</span>;
  if (status === "failed") return <span className="text-[10px] text-rose-400 font-medium">failed</span>;
  if (status === "running") return <span className="text-[10px] text-sky-400 font-medium">running</span>;
  return <span className="text-[10px] text-muted-foreground font-medium">pending</span>;
}

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function AssessmentCard({ a }: { a: AssessmentSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Confidence</div>
          {confidenceBar(a.confidence)}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Routing</div>
          {routingBadge(a.routing)}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Retrieval</div>
        <div className="text-xs text-foreground/80">
          <span className="font-mono">{a.retrieval_mode}</span>
          {" · "}
          <span>{a.retrieval_chunks_used} chunk{a.retrieval_chunks_used !== 1 ? "s" : ""} retrieved</span>
        </div>
      </div>

      {a.evidence_refs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Evidence retrieved</div>
          <ul className="space-y-1.5">
            {a.evidence_refs.map((ref, i) => (
              <li
                key={i}
                className="text-[11px] text-foreground/75 leading-snug pl-3 border-l-2 border-primary/30"
                data-testid={`rag-evidence-${i}`}
              >
                {ref.length > 180 ? ref.slice(0, 180) + "…" : ref}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Recommendation</div>
        <p className="text-xs text-foreground/90 leading-relaxed">{a.recommendation}</p>
      </div>
    </div>
  );
}

function ApprovalCard({ ap }: { ap: ApprovalSummary }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {approvalStatusBadge(ap.status)}
        <span className="text-[11px] text-muted-foreground">Request #{ap.id}</span>
        <span className="text-[11px] text-muted-foreground">· Risk: {ap.risk_level}</span>
      </div>
      {ap.decided_by && (
        <div className="text-[11px] text-muted-foreground">
          Decided by <span className="text-foreground">{ap.decided_by}</span>
          {ap.decision_note && <span> · "{ap.decision_note}"</span>}
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: JobSummary }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <div className="min-w-0">
        <div className="text-xs font-mono truncate text-foreground/80">
          {job.workflow} / {job.stage}
        </div>
        {job.last_error && (
          <div className="text-[10px] text-rose-400 truncate mt-0.5">{job.last_error}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {jobStatusBadge(job.status)}
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ×{job.attempt_count}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RagAssessmentPanelProps {
  workflowId: number;
  portfolioCompanyId: number;
}

export function RagAssessmentPanel({ workflowId, portfolioCompanyId }: RagAssessmentPanelProps) {
  const { data, isLoading, error } = useRagPipelineState(workflowId, portfolioCompanyId);

  return (
    <Card
      className="surface-raised p-5 space-y-5"
      data-testid="rag-assessment-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain className="size-4 text-primary shrink-0" />
        <div>
          <div className="text-sm font-semibold tracking-tight">RAG Assessment</div>
          <div className="text-[11px] text-muted-foreground">
            Vector retrieval · LLM verdict · Confidence-gated routing
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 text-xs text-rose-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>
            {error instanceof Error ? error.message : "Failed to load pipeline state"}
          </span>
        </div>
      )}

      {/* Data */}
      {data && !isLoading && (
        <div className="space-y-5">
          {/* Top-level status row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Job status</div>
              <div
                className="text-xs font-medium capitalize text-foreground"
                data-testid="rag-workflow-status"
              >
                {data.workflow_status.replace(/_/g, " ")}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Layers className="size-3" /> Attempts
              </div>
              <div
                className="text-xs font-mono font-semibold text-foreground tabular-nums"
                data-testid="rag-attempt-count"
              >
                {data.assessment_count}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <ListChecks className="size-3" /> Evidence
              </div>
              <div className="text-xs font-mono font-semibold text-foreground tabular-nums" data-testid="rag-evidence-count">
                {data.latest_assessment?.evidence_refs.length ?? 0} ref{(data.latest_assessment?.evidence_refs.length ?? 0) !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Assessment detail */}
          {data.latest_assessment ? (
            <AssessmentCard a={data.latest_assessment} />
          ) : (
            <div className="text-xs text-muted-foreground italic">
              No RAG assessment has been run for this workflow yet.
            </div>
          )}

          {/* Approval section */}
          {data.approval_request && (
            <div className="pt-4 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Approval status</div>
              <ApprovalCard ap={data.approval_request} />
            </div>
          )}

          {/* Background jobs */}
          {data.jobs.length > 0 && (
            <div className="pt-4 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Background jobs
              </div>
              <div>
                {data.jobs.map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
