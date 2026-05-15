import type {
  AgentStepStatus,
  ApprovalStatus,
  Priority,
  RiskLevel,
  WorkflowStatus,
} from "@workspace/api-client-react";

export function formatCurrencyCents(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${(dollars / 1_000).toFixed(1)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function workflowStatusLabel(status: WorkflowStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function workflowStatusBadge(status: WorkflowStatus): string {
  switch (status) {
    case "submitted":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    case "triaged":
    case "legal_review":
    case "finance_review":
    case "communications_draft":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "approval_pending":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "approved":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "finalized":
      return "bg-emerald-600/15 text-emerald-300 border-emerald-500/30";
    case "rejected":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "failed":
      return "bg-rose-600/20 text-rose-200 border-rose-500/40";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function riskBadge(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    case "critical":
      return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function priorityBadge(p: Priority): string {
  switch (p) {
    case "low":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    case "medium":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "high":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "urgent":
      return "bg-rose-500/15 text-rose-300 border-rose-500/40";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function stepStatusBadge(s: AgentStepStatus): string {
  switch (s) {
    case "pending":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    case "running":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "completed":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "failed":
      return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function approvalStatusBadge(s: ApprovalStatus): string {
  switch (s) {
    case "pending":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "approved":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "rejected":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "revision_requested":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
