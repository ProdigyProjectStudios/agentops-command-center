import { Link } from "wouter";
import { motion } from "framer-motion";
import { ListChecks, PlusCircle } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { useListWorkflows } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import {
  formatRelative,
  formatCurrencyCents,
  workflowStatusBadge,
  workflowStatusLabel,
  riskBadge,
  priorityBadge,
} from "@/lib/format";
import { PAGE } from "@/lib/copy";

export default function WorkflowsListPage() {
  const { data, isLoading, error, refetch } = useListWorkflows();

  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          {PAGE.workflows.title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{PAGE.workflows.subtitle}</p>
      </div>

      {error ? (
        <ErrorState
          title="Couldn't load workflows"
          description={error instanceof Error ? error.message : "The workflows API didn't respond."}
          onRetry={() => refetch()}
          testId="error-workflows"
        />
      ) : (
      <Card className="bg-card border-card-border overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-card-border bg-card/60">
          <div className="col-span-5">Request</div>
          <div className="col-span-2">Company</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-1">Risk</div>
          <div className="col-span-1 text-right">Cost</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Created</div>
        </div>
        {isLoading && (
          <div className="p-5 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {(data ?? []).map((w, idx) => (
          <motion.div
            key={w.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut", delay: Math.min(idx, 12) * 0.025 }}
            className="border-b border-card-border last:border-0"
          >
          <Link
            href={`/workflows/${w.id}`}
            className="grid grid-cols-12 gap-4 px-5 py-3 text-sm hover-elevate"
            data-testid={`row-workflow-${w.id}`}
          >
            <div className="col-span-5 min-w-0">
              <div className="font-medium truncate">{w.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {w.department} · {w.currentStage}
              </div>
            </div>
            <div className="col-span-2 text-muted-foreground truncate self-center">
              {w.portfolioCompanyName}
            </div>
            <div className="col-span-1 self-center">
              <StatusBadge className={priorityBadge(w.priority)}>{w.priority}</StatusBadge>
            </div>
            <div className="col-span-1 self-center">
              <StatusBadge className={riskBadge(w.riskLevel)}>{w.riskLevel}</StatusBadge>
            </div>
            <div className="col-span-1 text-right tabular-nums self-center">
              {formatCurrencyCents(w.estimatedCostCents)}
            </div>
            <div className="col-span-1 self-center">
              <StatusBadge className={workflowStatusBadge(w.status)}>
                {workflowStatusLabel(w.status)}
              </StatusBadge>
            </div>
            <div className="col-span-1 text-right text-xs text-muted-foreground self-center">
              {formatRelative(w.createdAt)}
            </div>
          </Link>
          </motion.div>
        ))}
        {data && data.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title="No workflows yet"
            description="File the first operational request and the agent crew will spin up a run in seconds."
            action={
              <Button asChild>
                <Link href="/requests/new">
                  <PlusCircle className="size-4" />
                  New Request
                </Link>
              </Button>
            }
            variant="bare"
            testId="empty-workflows"
          />
        )}
      </Card>
      )}
    </div>
    </PageTransition>
  );
}
