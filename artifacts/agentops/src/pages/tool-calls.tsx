import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Search,
  Wrench,
} from "lucide-react";
import {
  useListToolCalls,
  type ToolCallEntry,
  type ToolCallStatus,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { IllNoToolCalls } from "@/components/illustrations";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { formatTimestamp } from "@/lib/format";
import { PAGE } from "@/lib/copy";
import { cn } from "@/lib/utils";

type SortKey = "createdAt" | "toolName" | "durationMs" | "status";

function statusClass(s: ToolCallStatus): string {
  switch (s) {
    case "success":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "failed":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "running":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  }
}

export default function ToolCallsPage() {
  const { data, isLoading, error, refetch } = useListToolCalls();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ToolCallStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const list = (data ?? []).filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        c.toolName.toLowerCase().includes(q) ||
        c.workflowTitle.toLowerCase().includes(q) ||
        c.outputSummary.toLowerCase().includes(q) ||
        (c.agentName ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === "durationMs") {
        cmp = a.durationMs - b.durationMs;
      } else if (sortKey === "toolName") {
        cmp = a.toolName.localeCompare(b.toolName);
      } else {
        cmp = a.status.localeCompare(b.status);
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [data, query, statusFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "toolName");
    }
  }

  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          {PAGE.toolCalls.title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{PAGE.toolCalls.subtitle}</p>
      </div>

      {error && (
        <ErrorState
          title="Couldn't load tool calls"
          description={error instanceof Error ? error.message : "The tool calls API didn't respond."}
          onRetry={() => refetch()}
          testId="error-tool-calls"
        />
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tool, workflow, agent…"
            className="pl-9"
            data-testid="input-tool-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[160px] shrink-0" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {rows.length} call{rows.length !== 1 ? "s" : ""}
        </div>
      </div>

      <Card className="bg-card border-card-border overflow-hidden">

        {/* ── Desktop table header (hidden on mobile) ──────────────────── */}
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-card-border bg-card/60">
          <SortHeader label="Tool" sortKey="toolName" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-2" />
          <div className="col-span-2">Workflow</div>
          <div className="col-span-3">Input</div>
          <div className="col-span-2">Output</div>
          <SortHeader label="Status" sortKey="status" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-1" />
          <SortHeader label="Duration" sortKey="durationMs" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-1 justify-end" />
          <SortHeader label="When" sortKey="createdAt" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-1 justify-end" />
        </div>

        {isLoading && (
          <div className="p-5">
            <LoadingState
              icon={Wrench}
              title="Loading tool calls"
              description="Fetching every external API call the agents have issued…"
              variant="bare"
              testId="loading-tool-calls"
            >
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </LoadingState>
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <EmptyState
            illustration={<IllNoToolCalls />}
            title="No tool calls match"
            description="Try clearing the search or switching the status filter."
            variant="bare"
            tone="muted"
            testId="empty-tool-calls"
          />
        )}

        {rows.map((tc, idx) => (
          <motion.div
            key={tc.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: Math.min(idx, 12) * 0.02 }}
          >
            <ToolRow
              tc={tc}
              expanded={expandedId === tc.id}
              onToggle={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
            />
          </motion.div>
        ))}
      </Card>
    </div>
    </PageTransition>
  );
}

function ToolRow({
  tc,
  expanded,
  onToggle,
}: {
  tc: ToolCallEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* ── Desktop row (hidden on mobile) ──────────────────────────────── */}
      <button
        onClick={onToggle}
        data-testid={`tool-row-${tc.id}`}
        className="hidden md:grid w-full grid-cols-12 gap-3 px-5 py-3 text-sm border-b border-card-border last:border-0 hover-elevate text-left items-center"
      >
        <div className="col-span-2 flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="size-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground shrink-0" />
          )}
          <Wrench className="size-3.5 text-primary shrink-0" />
          <code className="text-xs font-mono truncate">{tc.toolName}</code>
        </div>
        <div className="col-span-2 min-w-0">
          <div className="truncate text-xs">{tc.workflowTitle}</div>
          {tc.agentName && (
            <div className="text-[11px] text-muted-foreground truncate">{tc.agentName}</div>
          )}
        </div>
        <div
          className="col-span-3 text-xs text-muted-foreground truncate font-mono"
          data-testid={`tool-input-summary-${tc.id}`}
          title={summarizeJson(tc.input, 200)}
        >
          {summarizeJson(tc.input, 80)}
        </div>
        <div className="col-span-2 text-xs text-muted-foreground truncate">
          {tc.outputSummary}
        </div>
        <div className="col-span-1">
          <StatusBadge className={statusClass(tc.status)}>{tc.status}</StatusBadge>
        </div>
        <div className="col-span-1 text-right text-xs tabular-nums text-muted-foreground">
          {tc.durationMs}ms
        </div>
        <div className="col-span-1 text-right text-xs tabular-nums text-muted-foreground">
          {formatTimestamp(tc.createdAt)}
        </div>
      </button>

      {/* ── Mobile card ─────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        data-testid={`tool-row-mobile-${tc.id}`}
        className="md:hidden w-full flex flex-col gap-2.5 px-4 py-4 border-b border-card-border last:border-0 hover-elevate text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? (
              <ChevronDown className="size-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground shrink-0" />
            )}
            <Wrench className="size-3.5 text-primary shrink-0" />
            <code className="text-sm font-mono truncate">{tc.toolName}</code>
          </div>
          <StatusBadge className={statusClass(tc.status)}>{tc.status}</StatusBadge>
        </div>
        <div className="text-xs text-muted-foreground truncate pl-5">
          {tc.workflowTitle}
          {tc.agentName && <span className="text-muted-foreground/60"> · {tc.agentName}</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono pl-5"
          data-testid={`tool-input-summary-${tc.id}`}
        >
          {summarizeJson(tc.input, 60)}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/70 pl-5">
          <span>{tc.durationMs}ms</span>
          <span>{formatTimestamp(tc.createdAt)}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 md:px-5 py-4 border-b border-card-border bg-background/40 space-y-3" data-testid={`tool-detail-${tc.id}`}>
          <div className="flex items-center justify-between text-xs">
            <Link
              href={`/workflows/${tc.workflowRunId}`}
              className="text-primary hover:underline"
              data-testid={`link-workflow-${tc.id}`}
            >
              Open workflow #{tc.workflowRunId} →
            </Link>
          </div>
          <DetailBlock label="Input" value={tc.input} />
          <DetailBlock label="Output" value={tc.output} />
        </div>
      )}
    </>
  );
}

function summarizeJson(value: unknown, max: number): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.length > max ? value.slice(0, max - 1) + "…" : value;
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "—";
  const parts = entries.map(([k, v]) => {
    let display: string;
    if (v == null) display = "null";
    else if (typeof v === "string") display = `"${v}"`;
    else if (typeof v === "object") display = Array.isArray(v) ? `[${v.length}]` : "{…}";
    else display = String(v);
    return `${k}: ${display}`;
  });
  const joined = parts.join(", ");
  return joined.length > max ? joined.slice(0, max - 1) + "…" : joined;
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
  let body: string;
  try {
    body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    body = String(value);
  }
  if (!body) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <pre className="text-xs font-mono bg-card/60 border border-border rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-64">
        {body}
      </pre>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  asc,
  onClick,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={cn("flex items-center gap-1 hover:text-foreground transition-colors", className)}
      data-testid={`sort-${sortKey}`}
    >
      {label}
      {active &&
        (asc ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />)}
    </button>
  );
}
