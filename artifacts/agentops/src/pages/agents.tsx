import { motion } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import {
  Bot,
  Briefcase,
  Calculator,
  Database,
  Megaphone,
  ScrollText,
  Wrench,
  Activity as ActivityIcon,
} from "lucide-react";
import {
  useListAgents,
  useListWorkflows,
  type AgentDirectoryEntry,
  type WorkflowStatus,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const AGENT_ICONS: Record<string, typeof Bot> = {
  "ops-conductor": Briefcase,
  "legal-counsel": ScrollText,
  "finance-analyst": Calculator,
  communications: Megaphone,
  memory: Database,
};

type DerivedStatus = "active" | "idle";

const TERMINAL_STATUSES = new Set<WorkflowStatus>([
  "approved",
  "rejected",
  "finalized",
  "failed",
]);

function statusBadgeClass(status: DerivedStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "idle":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  }
}

export default function AgentsPage() {
  const { data, isLoading } = useListAgents();
  const { data: workflows } = useListWorkflows();
  const anyRunning = (workflows ?? []).some((w) => !TERMINAL_STATUSES.has(w.status));

  function deriveStatus(agent: AgentDirectoryEntry): DerivedStatus {
    return anyRunning && agent.status !== "offline" ? "active" : "idle";
  }

  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Agent Directory
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The multi-agent crew that powers AgentOps. Each one specializes, all share memory.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      >
        {(data ?? []).map((agent) => {
          const Icon = AGENT_ICONS[agent.slug] ?? Bot;
          const derived = deriveStatus(agent);
          return (
            <motion.div
              key={agent.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
              }}
            >
            <Card
              className="p-5 bg-card border-card-border flex flex-col h-full"
              data-testid={`agent-card-${agent.slug}`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="size-11 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Icon className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                    <StatusBadge
                      className={statusBadgeClass(derived)}
                      testId={`agent-status-${agent.slug}`}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          derived === "active" && "bg-emerald-300 animate-pulse",
                          derived === "idle" && "bg-slate-300",
                        )}
                      />
                      {derived}
                    </StatusBadge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{agent.role}</div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">{agent.description}</p>

              <div className="space-y-3 mt-auto">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Capabilities
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.capabilities.map((c) => (
                      <span
                        key={c}
                        className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Connected Tools
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.tools.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] px-2 py-0.5 rounded bg-card border border-border text-muted-foreground inline-flex items-center gap-1"
                      >
                        <Wrench className="size-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <ActivityIcon className="size-3" />
                    {agent.recentActionCount} actions today
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {agent.lastActiveAt ? formatRelative(agent.lastActiveAt) : "—"}
                  </span>
                </div>
              </div>
            </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
    </PageTransition>
  );
}
