import { Fragment, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCheck2,
  LayoutDashboard,
  PlusCircle,
  ListChecks,
  CheckCircle2,
  Bot,
  BookOpen,
  Wrench,
  Settings,
  Sparkles,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from "lucide-react";
import { useGetSystemMode } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { useSidebarCollapsed } from "@/hooks/use-sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  testId: string;
  section?: string;
};

const NAV: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    icon: Sparkles,
    testId: "nav-overview",
    section: "Start here",
  },
  {
    href: "/workers/authorization",
    label: "Coverage Worker",
    icon: FileCheck2,
    testId: "nav-authorization-worker",
  },
  {
    href: "/demo/healthcare",
    label: "Guided Demo",
    icon: Network,
    testId: "nav-guided-demo",
  },
  {
    href: "/proof-lab",
    label: "Proof Lab",
    icon: ListChecks,
    testId: "nav-proof-lab",
  },
  {
    href: "/evaluations",
    label: "Evaluations",
    icon: CheckCircle2,
    testId: "nav-evaluations",
  },
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
    section: "Operations",
  },
  {
    href: "/requests/new",
    label: "New Request",
    icon: PlusCircle,
    testId: "nav-new-request",
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: ListChecks,
    testId: "nav-workflows",
  },
  {
    href: "/approvals",
    label: "Approvals",
    icon: CheckCircle2,
    testId: "nav-approvals",
  },
  {
    href: "/agents",
    label: "Agents",
    icon: Bot,
    testId: "nav-agents",
    section: "System",
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    icon: BookOpen,
    testId: "nav-knowledge",
  },
  {
    href: "/tool-calls",
    label: "Tool Calls",
    icon: Wrench,
    testId: "nav-tool-calls",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    testId: "nav-settings",
  },
  {
    href: "/architecture",
    label: "Architecture",
    icon: Network,
    testId: "nav-architecture",
  },
];

export function AppShell({
  children,
  onOpenPalette,
}: {
  children: ReactNode;
  onOpenPalette?: () => void;
}) {
  const [location] = useLocation();
  const { data: mode } = useGetSystemMode();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="min-h-screen flex bg-background text-foreground">
        {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────── */}
        <aside
          className={cn(
            "shrink-0 bg-sidebar border-r border-sidebar-border/60 flex-col transition-[width] duration-300 ease-out",
            "hidden md:flex",
            collapsed ? "w-[60px]" : "w-[208px]",
          )}
          data-testid="sidebar"
          data-collapsed={collapsed}
        >
          {/* Brand row + collapse toggle */}
          <div
            className={cn(
              "flex items-center gap-2",
              collapsed
                ? "px-2.5 py-4 justify-center"
                : "px-3.5 py-4 justify-between",
            )}
          >
            <Link
              href="/"
              className={cn(
                "flex items-center gap-2.5 min-w-0",
                collapsed && "justify-center",
              )}
              data-testid="link-home"
            >
              <Logo size={collapsed ? 28 : 30} />
              {!collapsed && (
                <div className="min-w-0">
                  <div className="font-medium text-sidebar-foreground text-[13px] leading-tight tracking-tight">
                    AgentOps
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70 leading-tight mt-0.5">
                    Command Center
                  </div>
                </div>
              )}
            </Link>
            {!collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="p-1 rounded-md text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors"
                data-testid="button-sidebar-collapse"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="size-3.5" />
              </button>
            )}
          </div>

          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-sidebar-border/70 to-transparent" />

          {collapsed && (
            <div className="px-2.5 pt-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    className="w-full flex items-center justify-center p-1.5 rounded-md text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors"
                    data-testid="button-sidebar-expand"
                    aria-label="Expand sidebar"
                  >
                    <PanelLeftOpen className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Expand
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          <nav
            className={cn(
              "flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden",
              collapsed ? "px-2" : "px-2.5",
            )}
          >
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? location === "/"
                  : location.startsWith(item.href);
              const Icon = item.icon;
              const linkBody = (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={item.testId}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center rounded-md text-[13px] font-normal transition-colors",
                    collapsed ? "justify-center p-2" : "gap-2.5 px-2.5 py-1.5",
                    active
                      ? "bg-sidebar-accent/70 text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-foreground",
                  )}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-full bg-gradient-to-b from-primary to-chart-2"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={cn(
                      "shrink-0 transition-[filter,color] duration-300",
                      collapsed ? "size-[16px]" : "size-[15px]",
                      active
                        ? "text-primary [filter:drop-shadow(0_0_6px_hsl(var(--primary)/0.55))]"
                        : "text-muted-foreground/80 group-hover:text-primary group-hover:[filter:drop-shadow(0_0_8px_hsl(var(--primary)/0.7))_drop-shadow(0_0_14px_hsl(var(--chart-2)/0.35))]",
                    )}
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  {!collapsed && (
                    <span
                      className={cn(
                        "relative inline-block whitespace-nowrap tracking-tight transition-[text-shadow,color] duration-300",
                        "after:pointer-events-none after:absolute after:left-0 after:-bottom-1 after:h-[1.5px] after:w-0 after:rounded-full after:bg-gradient-to-r after:from-primary after:to-chart-2 after:shadow-[0_0_6px_hsl(var(--primary)/0.6)] after:transition-[width] after:duration-300 after:ease-out",
                        "group-hover:text-sidebar-foreground group-hover:after:w-full group-hover:[text-shadow:0_0_10px_hsl(var(--primary)/0.65),0_0_22px_hsl(var(--chart-2)/0.3)]",
                        active &&
                          "font-medium text-sidebar-foreground after:w-full [text-shadow:0_0_10px_hsl(var(--primary)/0.5)]",
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              );
              if (!collapsed)
                return (
                  <Fragment key={item.href}>
                    {item.section && (
                      <p className="px-2.5 pt-4 pb-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
                        {item.section}
                      </p>
                    )}
                    {linkBody}
                  </Fragment>
                );
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkBody}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          <div
            className={cn(
              "text-[10px] text-muted-foreground/70",
              collapsed ? "px-2 py-3 text-center" : "px-3.5 py-3 space-y-0.5",
            )}
          >
            <div
              className={cn(
                "h-px bg-gradient-to-r from-transparent via-sidebar-border/70 to-transparent",
                collapsed ? "mb-2" : "-mx-1 mb-2.5",
              )}
            />
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/overview"
                    className="inline-flex items-center justify-center size-7 rounded-md hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-colors"
                    data-testid="footer-link-overview"
                    aria-label="About this project"
                  >
                    <Sparkles className="size-3.5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  About this project
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Link
                  href="/overview"
                  className="block hover:text-sidebar-foreground transition-colors tracking-tight"
                  data-testid="footer-link-overview"
                >
                  About this project →
                </Link>
                <div className="uppercase tracking-[0.18em] text-muted-foreground/50">
                  v0.1 · Portfolio Demo
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ── Mobile full-screen drawer ────────────────────────────────────── */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
                onClick={() => setMobileOpen(false)}
                aria-hidden="true"
              />

              {/* Drawer panel */}
              <motion.div
                key="drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{
                  type: "spring",
                  stiffness: 340,
                  damping: 36,
                  mass: 0.8,
                }}
                className="fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border/60 flex flex-col md:hidden"
              >
                {/* Drawer header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-sidebar-border/40">
                  <Link
                    href="/"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3"
                  >
                    <Logo size={32} />
                    <div>
                      <div className="font-semibold text-sidebar-foreground text-sm leading-tight tracking-tight">
                        AgentOps
                      </div>
                      <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60 leading-tight mt-0.5">
                        Command Center
                      </div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40 transition-colors"
                    aria-label="Close menu"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                {/* Nav links */}
                <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                  {NAV.map((item, i) => {
                    const active =
                      item.href === "/"
                        ? location === "/"
                        : location.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: 0.04 + i * 0.03,
                          duration: 0.22,
                          ease: "easeOut",
                        }}
                      >
                        {item.section && (
                          <p className="px-3.5 pt-4 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                            {item.section}
                          </p>
                        )}
                        <Link
                          aria-current={active ? "page" : undefined}
                          href={item.href}
                          data-testid={`mobile-${item.testId}`}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "group relative flex items-center gap-3.5 rounded-lg px-3.5 py-2.5 text-sm font-normal transition-colors",
                            active
                              ? "bg-sidebar-accent/70 text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-foreground",
                          )}
                        >
                          {active && (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2.5px] rounded-r-full bg-gradient-to-b from-primary to-chart-2"
                              aria-hidden="true"
                            />
                          )}
                          <Icon
                            className={cn(
                              "size-[17px] shrink-0 transition-[filter,color] duration-300",
                              active
                                ? "text-primary [filter:drop-shadow(0_0_6px_hsl(var(--primary)/0.6))]"
                                : "text-muted-foreground/70 group-hover:text-primary",
                            )}
                            strokeWidth={active ? 2.25 : 1.75}
                          />
                          <span
                            className={cn(
                              "tracking-tight",
                              active && "font-medium text-sidebar-foreground",
                            )}
                          >
                            {item.label}
                          </span>
                        </Link>
                      </motion.div>
                    );
                  })}
                </nav>

                {/* Drawer footer */}
                <div className="px-5 py-4 border-t border-sidebar-border/40">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    v0.1 · Portfolio Demo
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Main content column ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 shrink-0 bg-card/40 backdrop-blur border-b border-border flex items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-3 min-w-0">
              {/* Hamburger — mobile only */}
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-1.5 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30 transition-colors"
                aria-label="Open navigation menu"
                data-testid="button-mobile-menu"
              >
                <Menu className="size-5" />
              </button>

              <h1 className="font-semibold text-foreground text-base tracking-tight truncate">
                AgentOps Command Center
              </h1>
              <span className="text-muted-foreground/60 hidden sm:inline">
                ·
              </span>
              <span className="text-sm text-muted-foreground hidden sm:inline truncate">
                Multi-Agent Enterprise Operations
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {onOpenPalette && (
                <button
                  type="button"
                  onClick={onOpenPalette}
                  data-testid="button-open-command-palette"
                  aria-label="Open command palette"
                  className="hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-card-border bg-card/60 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <span>Jump to…</span>
                  <kbd className="ml-1 font-mono text-[10px] tracking-wider border border-card-border rounded px-1 py-px">
                    ⌘K
                  </kbd>
                </button>
              )}
              {mode && (
                <span
                  data-testid="badge-mode"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-medium uppercase tracking-[0.14em] font-mono",
                    mode.hasApiKey
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-300 border-amber-500/30",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      mode.hasApiKey ? "bg-emerald-400" : "bg-amber-400",
                    )}
                  />
                  <span className="hidden sm:inline">
                    {mode.hasApiKey ? "AI available" : "Demo available"}
                  </span>
                  <span className="sm:hidden">
                    {mode.hasApiKey ? "AI ready" : "Demo"}
                  </span>
                </span>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
