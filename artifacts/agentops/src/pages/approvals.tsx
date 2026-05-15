import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import {
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  RotateCcw,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import {
  useListApprovals,
  useApproveApproval,
  useRejectApproval,
  useRequestApprovalRevision,
  getListApprovalsQueryKey,
  getGetDashboardMetricsQueryKey,
  type ApprovalCard as ApprovalCardModel,
  type ApprovalStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import {
  approvalStatusBadge,
  formatRelative,
  riskBadge,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type FilterValue = "all" | ApprovalStatus;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "revision_requested", label: "Revision" },
  { value: "all", label: "All" },
];

export default function ApprovalsPage() {
  const [filter, setFilter] = useState<FilterValue>("pending");
  const params = filter === "all" ? undefined : { status: filter };
  const { data, isLoading } = useListApprovals(params, {
    query: { queryKey: getListApprovalsQueryKey(params) },
  });

  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Approval Queue
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Every decision the agents have escalated to a human, in one place.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
        <TabsList data-testid="tabs-filter">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} data-testid={`tab-${f.value}`}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && data && data.length === 0 && (
        <Card className="p-12 text-center bg-card border-card-border border-dashed">
          <div className="inline-flex size-12 rounded-full bg-primary/10 text-primary items-center justify-center mb-3">
            <Inbox className="size-6" />
          </div>
          <h3 className="font-semibold mb-1">Inbox zero</h3>
          <p className="text-sm text-muted-foreground">
            No approvals match this filter. The agents have nothing waiting on you right now.
          </p>
        </Card>
      )}

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {(data ?? []).map((card, idx) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: "easeOut", delay: Math.min(idx, 8) * 0.04 }}
            >
              <ApprovalRow card={card} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
    </PageTransition>
  );
}

function ApprovalRow({
  card,
}: {
  card: ApprovalCardModel;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [decidedBy, setDecidedBy] = useState("Operator");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const approvalsKeyRoot = getListApprovalsQueryKey()[0];

  function extractStatusFromKey(
    key: readonly unknown[],
  ): ApprovalCardModel["status"] | undefined {
    for (let i = 1; i < key.length; i++) {
      const part = key[i];
      if (part && typeof part === "object") {
        const visit = (obj: unknown): string | undefined => {
          if (!obj || typeof obj !== "object") return undefined;
          const rec = obj as Record<string, unknown>;
          if (typeof rec.status === "string") return rec.status;
          for (const v of Object.values(rec)) {
            if (v && typeof v === "object") {
              const found = visit(v);
              if (found) return found;
            }
          }
          return undefined;
        };
        const s = visit(part);
        if (s) return s as ApprovalCardModel["status"];
      }
    }
    return undefined;
  }

  function buildOptimistic(
    nextStatus: ApprovalCardModel["status"],
  ): {
    onMutate: () => Promise<{ snapshots: [readonly unknown[], ApprovalCardModel[] | undefined][] }>;
    onError: (
      _err: unknown,
      _vars: unknown,
      ctx?: { snapshots: [readonly unknown[], ApprovalCardModel[] | undefined][] },
    ) => void;
    onSettled: () => void;
  } {
    return {
      onMutate: async () => {
        await queryClient.cancelQueries({
          predicate: (q) => q.queryKey[0] === approvalsKeyRoot,
        });
        const snapshots = queryClient.getQueriesData<ApprovalCardModel[]>({
          predicate: (q) => q.queryKey[0] === approvalsKeyRoot,
        });
        const patched: ApprovalCardModel = {
          ...card,
          status: nextStatus,
          decidedBy: decidedBy || "Operator",
          decisionNote: note || null,
          decidedAt: new Date().toISOString(),
        };
        const matches = queryClient.getQueryCache().findAll({
          predicate: (q) => q.queryKey[0] === approvalsKeyRoot,
        });
        for (const q of matches) {
          const prev = q.state.data as ApprovalCardModel[] | undefined;
          if (!prev) continue;
          const filterStatus = extractStatusFromKey(q.queryKey);
          const present = prev.some((c) => c.id === card.id);
          let next: ApprovalCardModel[];
          if (!filterStatus || filterStatus === nextStatus) {
            next = present
              ? prev.map((c) => (c.id === card.id ? patched : c))
              : [patched, ...prev];
          } else {
            next = prev.filter((c) => c.id !== card.id);
          }
          queryClient.setQueryData(q.queryKey, next);
        }
        return { snapshots };
      },
      onError: (_err, _vars, ctx) => {
        if (!ctx) return;
        for (const [key, value] of ctx.snapshots) {
          queryClient.setQueryData(key, value);
        }
        toast({ title: "Action failed", variant: "destructive" });
      },
      onSettled: () => {
        queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] === approvalsKeyRoot,
        });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
      },
    };
  }

  const approve = useApproveApproval({
    mutation: {
      ...buildOptimistic("approved"),
      onSuccess: () => toast({ title: "Approved", description: card.workflowTitle }),
    },
  });
  const reject = useRejectApproval({
    mutation: {
      ...buildOptimistic("rejected"),
      onSuccess: () => toast({ title: "Rejected", description: card.workflowTitle }),
    },
  });
  const revise = useRequestApprovalRevision({
    mutation: {
      ...buildOptimistic("revision_requested"),
      onSuccess: () =>
        toast({ title: "Revision requested", description: card.workflowTitle }),
    },
  });

  const decided = card.status !== "pending";
  const busy = approve.isPending || reject.isPending || revise.isPending;

  return (
    <Card
      className={cn(
        "p-5 bg-card border-card-border transition-colors",
        card.status === "pending" && "border-amber-500/30",
      )}
      data-testid={`approval-card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge className={approvalStatusBadge(card.status)} testId={`approval-status-${card.id}`}>
              {card.status === "pending" ? (
                <Clock className="size-3" />
              ) : card.status === "approved" ? (
                <CheckCircle2 className="size-3" />
              ) : card.status === "rejected" ? (
                <XCircle className="size-3" />
              ) : (
                <RotateCcw className="size-3" />
              )}
              {card.status.replace("_", " ")}
            </StatusBadge>
            <StatusBadge className={riskBadge(card.riskLevel)}>
              {card.riskLevel} risk
            </StatusBadge>
            <span className="text-xs text-muted-foreground">
              {card.portfolioCompanyName} · {formatRelative(card.createdAt)}
            </span>
          </div>
          <Link
            href={`/workflows/${card.workflowRunId}`}
            className="text-base font-semibold hover:text-primary inline-flex items-center gap-1.5"
            data-testid={`link-workflow-${card.id}`}
          >
            {card.workflowTitle}
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </Link>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
            Summary
          </div>
          <p className="text-sm" data-testid={`approval-summary-${card.id}`}>
            {card.summary}
          </p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
            Recommendation
          </div>
          <p className="text-sm" data-testid={`approval-recommendation-${card.id}`}>
            {card.recommendation}
          </p>
        </div>
      </div>

      {decided ? (
        <div className="mt-4 pt-3 border-t border-border text-xs">
          <span className="text-muted-foreground">Decided by </span>
          <span className="font-medium">{card.decidedBy ?? "—"}</span>
          <span className="text-muted-foreground"> · {formatRelative(card.decidedAt)}</span>
          {card.decisionNote && (
            <p className="text-muted-foreground italic mt-1">"{card.decisionNote}"</p>
          )}
        </div>
      ) : (
        <div className="mt-4 pt-3 border-t border-border space-y-3">
          {open && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor={`decidedBy-${card.id}`}>
                  Decided By
                </Label>
                <Input
                  id={`decidedBy-${card.id}`}
                  value={decidedBy}
                  onChange={(e) => setDecidedBy(e.target.value)}
                  className="mt-1"
                  data-testid={`input-decided-by-${card.id}`}
                />
              </div>
              <div>
                <Label className="text-xs" htmlFor={`note-${card.id}`}>
                  Note (optional)
                </Label>
                <Textarea
                  id={`note-${card.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={1}
                  className="mt-1"
                  data-testid={`input-note-${card.id}`}
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!open && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                data-testid={`button-decide-${card.id}`}
              >
                Make decision
              </Button>
            )}
            {open && (
              <>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    approve.mutate({ id: card.id, data: { decidedBy, note } })
                  }
                  data-testid={`button-approve-${card.id}`}
                >
                  {approve.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    revise.mutate({ id: card.id, data: { decidedBy, note } })
                  }
                  data-testid={`button-revise-${card.id}`}
                >
                  {revise.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  Request Revision
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    reject.mutate({ id: card.id, data: { decidedBy, note } })
                  }
                  data-testid={`button-reject-${card.id}`}
                >
                  {reject.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <XCircle className="size-3" />
                  )}
                  Reject
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  data-testid={`button-cancel-${card.id}`}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
          {card.riskLevel === "critical" && (
            <div className="text-xs text-rose-300 inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3" /> High-risk decision — double-check the recommendation.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
