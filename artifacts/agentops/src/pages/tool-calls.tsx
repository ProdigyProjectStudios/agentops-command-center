import { useMemo, useState } from "react";
import { Link } from "wouter";
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
import { formatTimestamp } from "@/lib/format";
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
  const { data, isLoading } = useListToolCalls();
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
    <div className="px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Tool Call History
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Forensic log of every external API call agents have made, across every workflow.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tool, workflow, agent, or output…"
            className="pl-9"
            data-testid="input-tool-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground tabular-nums">
          {rows.length} call{rows.length !== 1 ? "s" : ""}
        </div>
      </div>

      <Card className="bg-card border-card-border overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-card-border bg-card/60">
          <SortHeader label="Tool" sortKey="toolName" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-3" />
          <div className="col-span-3">Workflow</div>
          <div className="col-span-3">Output</div>
          <SortHeader label="Status" sortKey="status" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-1" />
          <SortHeader label="Duration" sortKey="durationMs" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-1 justify-end" />
          <SortHeader label="When" sortKey="createdAt" current={sortKey} asc={sortAsc} onClick={toggleSort} className="col-span-1 justify-end" />
        </div>

        {isLoading && (
          <div className="p-5 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No tool calls match the current filters.
          </div>
        )}

        {rows.map((tc) => (
          <ToolRow
            key={tc.id}
            tc={tc}
            expanded={expandedId === tc.id}
            onToggle={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
          />
        ))}
      </Card>
    </div>
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
      <button
        onClick={onToggle}
        data-testid={`tool-row-${tc.id}`}
        className="w-full grid grid-cols-12 gap-3 px-5 py-3 text-sm border-b border-card-border last:border-0 hover-elevate text-left items-center"
      >
        <div className="col-span-3 flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="size-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground shrink-0" />
          )}
          <Wrench className="size-3.5 text-primary shrink-0" />
          <code className="text-xs font-mono truncate">{tc.toolName}</code>
        </div>
        <div className="col-span-3 min-w-0">
          <div className="truncate text-xs">{tc.workflowTitle}</div>
          {tc.agentName && (
            <div className="text-[11px] text-muted-foreground truncate">{tc.agentName}</div>
          )}
        </div>
        <div className="col-span-3 text-xs text-muted-foreground truncate">
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

      {expanded && (
        <div className="px-5 py-4 border-b border-card-border bg-background/40 space-y-3" data-testid={`tool-detail-${tc.id}`}>
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
