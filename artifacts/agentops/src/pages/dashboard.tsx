import { Link } from "wouter";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  Flag,
  Layers,
  PlusCircle,
  Sparkles,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import {
  useGetDashboardMetrics,
  useListWorkflows,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import {
  formatCurrencyCents,
  formatRelative,
  workflowStatusBadge,
  workflowStatusLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PAGE, PRODUCT } from "@/lib/copy";

const PILLARS: Array<{ icon: typeof Bot; label: string }> = [
  { icon: Bot, label: "Multi-agent triage" },
  { icon: Flag, label: "Human approvals" },
  { icon: BookOpen, label: "Shared memory" },
  { icon: Wrench, label: "Tool execution" },
  { icon: Activity, label: "Audit log" },
  { icon: Layers, label: "Portfolio view" },
];

export default function DashboardPage() {
  const {
    data: metrics,
    isLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useGetDashboardMetrics();
  const {
    data: workflows,
    error: workflowsError,
    refetch: refetchWorkflows,
  } = useListWorkflows();

  const recentWorkflows = (workflows ?? []).slice(0, 6);

  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Hero band — premium edition */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl border border-card-border bg-[radial-gradient(120%_120%_at_0%_0%,hsl(252_87%_67%/0.18)_0%,transparent_55%),radial-gradient(80%_80%_at_100%_100%,hsl(190_95%_60%/0.12)_0%,transparent_60%)] bg-card p-6 sm:p-9"
      >
        {/* Drifting grid + light beams */}
        <HeroGridBackdrop />

        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-[10px] uppercase tracking-[0.22em] text-primary font-medium mb-4">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              {PRODUCT.tagline}
            </div>
            <h2
              className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05] bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent"
              data-testid="text-page-title"
            >
              {PAGE.dashboard.title}
            </h2>
            <p className="text-muted-foreground mt-3 text-base sm:text-lg leading-relaxed max-w-xl">
              {PAGE.dashboard.subtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5">
              {PILLARS.map((p) => {
                const Icon = p.icon;
                return (
                  <div
                    key={p.label}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className="inline-flex size-5 rounded-md bg-primary/10 text-primary items-center justify-center">
                      <Icon className="size-3" />
                    </span>
                    {p.label}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/overview">
              <Button variant="outline" size="lg" data-testid="button-overview" asChild>
                <span className="cursor-pointer">
                  <Sparkles className="size-4" />
                  Why AgentOps
                </span>
              </Button>
            </Link>
            <Link href="/requests/new">
              <Button
                data-testid="button-new-request"
                size="lg"
                className="bg-gradient-to-r from-primary to-chart-2 text-primary-foreground shadow-lg shadow-primary/25 hover:opacity-95"
                asChild
              >
                <span className="cursor-pointer">
                  <PlusCircle className="size-4" />
                  New Request
                </span>
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>

      {(metricsError || workflowsError) && (
        <ErrorState
          title="Couldn't load the dashboard"
          description={
            (metricsError ?? workflowsError) instanceof Error
              ? ((metricsError ?? workflowsError) as Error).message
              : "The dashboard API didn't respond."
          }
          onRetry={() => {
            void refetchMetrics();
            void refetchWorkflows();
          }}
          testId="error-dashboard"
        />
      )}

      {/* KPI strip */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.06 } },
        }}
      >
        <MetricCard
          icon={Workflow}
          label="Active Workflows"
          value={metrics?.activeWorkflows}
          loading={isLoading}
          accent="text-sky-300"
          testId="metric-active-workflows"
        />
        <MetricCard
          icon={Clock}
          label="Pending Approvals"
          value={metrics?.pendingApprovals}
          loading={isLoading}
          accent="text-amber-300"
          testId="metric-pending-approvals"
        />
        <MetricCard
          icon={Zap}
          label="Agent Actions Today"
          value={metrics?.agentActionsToday}
          loading={isLoading}
          accent="text-violet-300"
          testId="metric-agent-actions"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Compliance Risks"
          value={metrics?.complianceRisksFlagged}
          loading={isLoading}
          accent="text-rose-300"
          testId="metric-compliance-risks"
        />
        <MetricCard
          icon={DollarSign}
          label="Cost Impact"
          value={
            metrics ? formatCurrencyCents(metrics.estimatedCostImpactCents) : undefined
          }
          loading={isLoading}
          accent="text-emerald-300"
          testId="metric-cost-impact"
        />
      </motion.div>

      {/* Demo story panel */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
      >
        <Card
          className="p-6 bg-gradient-to-br from-primary/8 via-card to-card border-primary/30"
          data-testid="card-demo-story"
        >
          <div className="flex items-start gap-4 flex-col lg:flex-row lg:items-center justify-between">
            <div className="flex items-start gap-4 max-w-3xl">
              <div className="size-11 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-primary/80 font-medium mb-1">
                  Demo Story
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  Acme HQ wants to spend $48K on emergency roof repair.
                </h3>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Submit the sample request and watch the crew light up: Ops triages, Memory pulls
                  the procurement policy, Legal reads the contract, Finance checks budget fit,
                  Comms drafts the announcement, and the run lands at the CFO approval gate —
                  end to end in under a minute.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:shrink-0">
              <Link href="/requests/new">
                <Button data-testid="button-run-demo" asChild>
                  <span className="cursor-pointer">
                    <PlusCircle className="size-4" />
                    Run the demo
                  </span>
                </Button>
              </Link>
              <Link href="/overview">
                <Button variant="outline" data-testid="button-see-how" asChild>
                  <span className="cursor-pointer">
                    See how it works <ArrowRight className="size-4" />
                  </span>
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Recent workflows + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 bg-card border-card-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm">Recent Workflows</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {metrics?.totalWorkflows ?? 0} total · {metrics?.completedWorkflows ?? 0} completed
              </p>
            </div>
            <Link
              href="/workflows"
              className="text-xs text-primary hover:underline flex items-center gap-1"
              data-testid="link-all-workflows"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentWorkflows.length === 0 && !workflows && (
              <LoadingState
                icon={Workflow}
                title="Loading recent workflows"
                description="Fetching the latest agent runs…"
                variant="bare"
                testId="loading-recent-workflows"
              >
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              </LoadingState>
            )}
            {workflows && recentWorkflows.length === 0 && (
              <EmptyState
                icon={Workflow}
                title="No workflows yet"
                description="File the first request and the agent crew will spin up a run in seconds."
                action={
                  <Link href="/requests/new">
                    <Button size="sm" asChild>
                      <span className="cursor-pointer">
                        <PlusCircle className="size-4" />
                        New Request
                      </span>
                    </Button>
                  </Link>
                }
                variant="bare"
                testId="empty-recent-workflows"
              />
            )}
            {recentWorkflows.map((w) => (
              <Link
                key={w.id}
                href={`/workflows/${w.id}`}
                data-testid={`row-workflow-${w.id}`}
                className="flex items-center gap-4 p-3 rounded-md border border-card-border bg-background/40 hover-elevate transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{w.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>{w.portfolioCompanyName}</span>
                    <span>·</span>
                    <span>{w.department}</span>
                    <span>·</span>
                    <span>{formatRelative(w.createdAt)}</span>
                  </div>
                </div>
                <StatusBadge className={workflowStatusBadge(w.status)} testId={`badge-status-${w.id}`}>
                  {workflowStatusLabel(w.status)}
                </StatusBadge>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-6 bg-card border-card-border">
          <h3 className="font-semibold text-sm mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {!metrics && (
              <LoadingState
                icon={Activity}
                title="Loading activity feed"
                variant="bare"
                testId="loading-activity"
              >
                <Skeleton className="h-32 w-full" />
              </LoadingState>
            )}
            {(metrics?.recentActivity ?? []).slice(0, 8).map((a) => (
              <div key={a.id} className="flex gap-3" data-testid={`activity-${a.id}`}>
                <div className="flex flex-col items-center pt-1">
                  <div className="size-2 rounded-full bg-primary/80" />
                  <div className="w-px flex-1 bg-border mt-1" />
                </div>
                <div className="flex-1 pb-3 border-b border-border/50 last:border-0">
                  <div className="text-xs text-foreground">{a.message}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    <span className="font-medium">{a.actor}</span> · {formatRelative(a.createdAt)}
                  </div>
                </div>
              </div>
            ))}
            {!metrics && <Skeleton className="h-32 w-full" />}
          </div>
        </Card>
      </div>

      <Card className="p-6 bg-card border-card-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Agent Health</h3>
          <Link
            href="/agents"
            className="text-xs text-primary hover:underline flex items-center gap-1"
            data-testid="link-all-agents"
          >
            View directory <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {(metrics?.agentHealth ?? []).map((agent) => (
            <div
              key={agent.id}
              data-testid={`agent-card-${agent.slug}`}
              className="p-4 rounded-md border border-card-border bg-background/40"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="size-8 rounded-md bg-primary/15 flex items-center justify-center text-primary">
                  <Activity className="size-4" />
                </div>
                <span
                  className={cn(
                    "size-2 rounded-full",
                    agent.status === "active" && "bg-emerald-400 animate-pulse",
                    agent.status === "idle" && "bg-slate-400",
                    agent.status === "offline" && "bg-rose-400",
                  )}
                />
              </div>
              <div className="text-sm font-medium truncate">{agent.name}</div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {agent.role}
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                {agent.recentActionCount} actions today
              </div>
            </div>
          ))}
          {!metrics && (
            <LoadingState
              icon={Bot}
              title="Loading agent crew"
              variant="bare"
              testId="loading-agent-health"
              className="col-span-full"
            >
              <Skeleton className="h-24 w-full" />
            </LoadingState>
          )}
        </div>
      </Card>
    </div>
    </PageTransition>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  loading,
  accent,
  testId,
}: {
  icon: typeof Activity;
  label: string;
  value: number | string | undefined;
  loading: boolean;
  accent: string;
  testId: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
      }}
    >
    <Card
      className="group relative overflow-hidden p-5 bg-card border-card-border hover:border-primary/40 transition-colors"
      data-testid={testId}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.14em] font-medium">
          {label}
        </span>
        <span className={cn("inline-flex size-7 rounded-md items-center justify-center bg-card-border/40", accent)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <div
        className="mt-4 text-3xl font-semibold tabular-nums tracking-tight"
        data-testid={`${testId}-value`}
      >
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : value !== undefined ? (
          value
        ) : (
          "—"
        )}
      </div>
    </Card>
    </motion.div>
  );
}

function HeroGridBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        maskImage:
          "radial-gradient(ellipse 80% 70% at 50% 40%, black 35%, transparent 85%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 70% at 50% 40%, black 35%, transparent 85%)",
      }}
    >
      {/* Drifting grid */}
      <motion.div
        className="absolute -inset-[44px] opacity-[0.09]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
        animate={{ backgroundPositionX: ["0px", "44px"], backgroundPositionY: ["0px", "44px"] }}
        transition={{ duration: 14, ease: "linear", repeat: Infinity }}
      />

      {/* Horizontal light dashes */}
      <HeroBeam orientation="horizontal" top="22%" length={180} duration={8.5} delay={0} colorVar="--primary" />
      <HeroBeam orientation="horizontal" top="58%" length={140} duration={10.5} delay={3.5} colorVar="--chart-2" />
      <HeroBeam orientation="horizontal" top="80%" length={200} duration={9.5} delay={1.8} colorVar="--primary" />

      {/* Vertical light dashes */}
      <HeroBeam orientation="vertical" left="18%" length={160} duration={11.5} delay={2.6} colorVar="--chart-2" />
      <HeroBeam orientation="vertical" left="62%" length={120} duration={9} delay={0.8} colorVar="--primary" />
      <HeroBeam orientation="vertical" left="86%" length={150} duration={12.5} delay={4.5} colorVar="--chart-2" />
    </div>
  );
}

function HeroBeam({
  orientation,
  top,
  left,
  length,
  duration,
  delay,
  colorVar,
}: {
  orientation: "horizontal" | "vertical";
  top?: string;
  left?: string;
  length: number;
  duration: number;
  delay: number;
  colorVar: string;
}) {
  const isH = orientation === "horizontal";
  const color = `hsl(var(${colorVar}))`;
  const gradient = isH
    ? `linear-gradient(to right, transparent 0%, ${color} 45%, ${color} 55%, transparent 100%)`
    : `linear-gradient(to bottom, transparent 0%, ${color} 45%, ${color} 55%, transparent 100%)`;

  return (
    <motion.div
      className="absolute"
      style={{
        top: isH ? top : `-${length}px`,
        left: isH ? `-${length}px` : left,
        width: isH ? `${length}px` : "1px",
        height: isH ? "1px" : `${length}px`,
        background: gradient,
        filter: "blur(0.4px)",
        boxShadow: `0 0 8px ${color}`,
      }}
      animate={
        isH
          ? { x: ["0%", "calc(100vw + 200px)"], opacity: [0, 1, 1, 0] }
          : { y: ["0%", "calc(100vh + 200px)"], opacity: [0, 1, 1, 0] }
      }
      transition={{
        duration,
        delay,
        repeat: Infinity,
        repeatDelay: 3.5,
        ease: "easeInOut",
        times: [0, 0.15, 0.85, 1],
      }}
    />
  );
}
