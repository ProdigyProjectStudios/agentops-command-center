import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  PlusCircle,
  ListChecks,
  CheckCircle2,
  Bot,
  BookOpen,
  Wrench,
  Settings,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
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
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { href: "/requests/new", label: "New Request", icon: PlusCircle, testId: "nav-new-request" },
  { href: "/workflows", label: "Workflows", icon: ListChecks, testId: "nav-workflows" },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2, testId: "nav-approvals" },
  { href: "/agents", label: "Agents", icon: Bot, testId: "nav-agents" },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen, testId: "nav-knowledge" },
  { href: "/tool-calls", label: "Tool Calls", icon: Wrench, testId: "nav-tool-calls" },
  { href: "/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
  { href: "/overview", label: "Why AgentOps", icon: Sparkles, testId: "nav-overview" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: mode } = useGetSystemMode();
  const [collapsed, setCollapsed] = useSidebarCollapsed();

  return (
    <TooltipProvider delayDuration={120}>
    <div className="min-h-screen flex bg-background text-foreground">
      <aside
        className={cn(
          "shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-[width] duration-300 ease-out",
          collapsed ? "w-[68px]" : "w-64",
        )}
        data-testid="sidebar"
        data-collapsed={collapsed}
      >
        {/* Brand row + collapse toggle */}
        <div
          className={cn(
            "border-b border-sidebar-border flex items-center gap-2",
            collapsed ? "px-3 py-4 justify-center" : "px-4 py-4 justify-between",
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
            <Logo size={collapsed ? 32 : 34} />
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-semibold text-sidebar-foreground text-sm leading-tight tracking-tight">
                  AgentOps
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 leading-tight mt-0.5">
                  Command Center
                </div>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
              data-testid="button-sidebar-collapse"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        {/* When collapsed, show expand button just below brand */}
        {collapsed && (
          <div className="px-3 pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setCollapsed(false)}
                  className="w-full flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                  data-testid="button-sidebar-expand"
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Expand</TooltipContent>
            </Tooltip>
          </div>
        )}

        <nav
          className={cn(
            "flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden",
            collapsed ? "px-2" : "px-3",
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
                className={cn(
                  "group relative flex items-center rounded-md text-sm transition-colors",
                  collapsed
                    ? "justify-center p-2.5"
                    : "gap-3 px-3 py-2",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                {/* Active indicator rail */}
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-chart-2"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={cn(
                    "shrink-0",
                    collapsed ? "size-[18px]" : "size-4",
                    active
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
            if (!collapsed) return linkBody;
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
            "border-t border-sidebar-border text-[11px] text-muted-foreground",
            collapsed ? "px-2 py-3 text-center" : "px-5 py-3 space-y-1",
          )}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/overview"
                  className="inline-flex items-center justify-center size-8 rounded-md hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  data-testid="footer-link-overview"
                  aria-label="About this project"
                >
                  <Sparkles className="size-3.5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>About this project</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <Link
                href="/overview"
                className="block hover:text-sidebar-foreground transition-colors"
                data-testid="footer-link-overview"
              >
                About this project →
              </Link>
              <div>v0.1 · Portfolio Demo</div>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 bg-card/40 backdrop-blur border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-semibold text-foreground text-base tracking-tight truncate">
              AgentOps Command Center
            </h1>
            <span className="text-muted-foreground/60 hidden sm:inline">·</span>
            <span className="text-sm text-muted-foreground hidden sm:inline truncate">
              Multi-Agent Enterprise Operations
            </span>
          </div>
          <div className="flex items-center gap-3">
            {mode && (
              <span
                data-testid="badge-mode"
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium uppercase tracking-wide",
                  mode.mode === "demo"
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
                )}
              >
                <span className={cn(
                  "size-1.5 rounded-full",
                  mode.mode === "demo" ? "bg-amber-400" : "bg-emerald-400",
                )} />
                {mode.mode === "demo" ? "Demo Mode" : "Live Mode"}
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
