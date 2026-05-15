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
  Activity,
} from "lucide-react";
import { useGetSystemMode } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

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

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
            <div className="size-9 rounded-lg bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center shadow-lg">
              <Activity className="size-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sidebar-foreground text-sm leading-tight">
                AgentOps
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                Command Center
              </div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? location === "/"
                : location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testId}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-3 border-t border-sidebar-border text-[11px] text-muted-foreground space-y-1">
          <Link
            href="/overview"
            className="block hover:text-sidebar-foreground transition-colors"
            data-testid="footer-link-overview"
          >
            About this project →
          </Link>
          <div>v0.1 · Portfolio Demo</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 bg-card/40 backdrop-blur border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-foreground text-base">
              AgentOps Command Center
            </h1>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-sm text-muted-foreground">
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
  );
}
