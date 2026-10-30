import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Command } from "cmdk";
import {
  ShieldCheck,
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
  Workflow,
  Search,
} from "lucide-react";
import { useListWorkflows, useListAgents } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { workflowStatusLabel } from "@/lib/format";

type NavTarget = {
  href: string;
  label: string;
  hint?: string;
  icon: typeof LayoutDashboard;
};

const PAGES: NavTarget[] = [
  {
    href: "/workers/authorization",
    label: "Authorization Worker",
    hint: "Live evidence reviews · human approval",
    icon: ShieldCheck,
  },
  {
    href: "/demo/healthcare",
    label: "Guided Demo",
    hint: "Healthcare · input to receipt",
    icon: Network,
  },
  {
    href: "/proof-lab",
    label: "Proof Lab",
    hint: "Saved evidence & execution",
    icon: ListChecks,
  },
  {
    href: "/evaluations",
    label: "Evaluations",
    hint: "Compare benchmark results",
    icon: CheckCircle2,
  },
  {
    href: "/",
    label: "Dashboard",
    hint: "Overview & KPIs",
    icon: LayoutDashboard,
  },
  {
    href: "/requests/new",
    label: "New Request",
    hint: "File a new run",
    icon: PlusCircle,
  },
  {
    href: "/workflows",
    label: "Workflows",
    hint: "All runs",
    icon: ListChecks,
  },
  {
    href: "/approvals",
    label: "Approvals",
    hint: "Pending human gates",
    icon: CheckCircle2,
  },
  { href: "/agents", label: "Agents", hint: "Agent directory", icon: Bot },
  {
    href: "/knowledge",
    label: "Knowledge",
    hint: "Shared memory",
    icon: BookOpen,
  },
  {
    href: "/tool-calls",
    label: "Tool Calls",
    hint: "Execution log",
    icon: Wrench,
  },
  { href: "/settings", label: "Settings", hint: "Mode & keys", icon: Settings },
  {
    href: "/overview",
    label: "Overview",
    hint: "Capabilities & proof path",
    icon: Sparkles,
  },
  {
    href: "/architecture",
    label: "Architecture",
    hint: "System diagram",
    icon: Network,
  },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const { data: workflows } = useListWorkflows();
  const { data: agents } = useListAgents();

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Explicit Escape-to-close. Listen at window so the handler still fires
  // whether focus is in the cmdk input, a list item, or the scrim.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    setLocation(href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4"
      data-testid="command-palette"
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-background/75 backdrop-blur-sm"
        data-testid="command-palette-scrim"
      />
      <Command
        loop
        className="relative w-full max-w-xl surface-raised shadow-2xl shadow-black/50 overflow-hidden"
        label="Command palette"
      >
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-card-border">
          <Search className="size-4 text-muted-foreground" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Jump to a workflow, agent, or page…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/70"
            data-testid="command-palette-input"
            autoFocus
          />
          <kbd className="hidden sm:inline text-[10px] font-mono text-muted-foreground/70 border border-card-border rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
          <Command.Empty className="px-3.5 py-8 text-center text-sm text-muted-foreground">
            Nothing matched. Try a workflow title or page name.
          </Command.Empty>

          <Command.Group
            heading="Pages"
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-mono px-2 pt-2 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1"
          >
            {PAGES.map((p) => {
              const Icon = p.icon;
              return (
                <Command.Item
                  key={p.href}
                  value={`page ${p.label} ${p.hint ?? ""}`}
                  onSelect={() => go(p.href)}
                  className={cn(
                    "flex items-center gap-3 px-2.5 py-2 rounded-md cursor-pointer text-sm",
                    "aria-selected:bg-sidebar-accent/70 aria-selected:text-sidebar-accent-foreground",
                  )}
                  data-testid={`command-page-${p.href.replace(/[/]/g, "_") || "_"}`}
                >
                  <Icon className="size-3.5 text-primary" />
                  <span className="flex-1">{p.label}</span>
                  {p.hint && (
                    <span className="text-[11px] text-muted-foreground">
                      {p.hint}
                    </span>
                  )}
                </Command.Item>
              );
            })}
          </Command.Group>

          {(agents ?? []).length > 0 && (
            <Command.Group
              heading="Agents"
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-mono px-2 pt-3 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1"
            >
              {(agents ?? []).map((a) => (
                <Command.Item
                  key={a.id}
                  value={`agent ${a.name} ${a.slug} ${a.role ?? ""}`}
                  onSelect={() => go(`/agents#${a.slug}`)}
                  className={cn(
                    "flex items-center gap-3 px-2.5 py-2 rounded-md cursor-pointer text-sm",
                    "aria-selected:bg-sidebar-accent/70 aria-selected:text-sidebar-accent-foreground",
                  )}
                  data-testid={`command-agent-${a.slug}`}
                >
                  <Bot className="size-3.5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{a.name}</div>
                    {a.role && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {a.role}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-mono">
                    {a.slug}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {(workflows ?? []).length > 0 && (
            <Command.Group
              heading="Workflows"
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-mono px-2 pt-3 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1"
            >
              {(workflows ?? []).slice(0, 30).map((w) => (
                <Command.Item
                  key={w.id}
                  value={`workflow ${w.title} ${w.portfolioCompanyName} ${w.department}`}
                  onSelect={() => go(`/workflows/${w.id}`)}
                  className={cn(
                    "flex items-center gap-3 px-2.5 py-2 rounded-md cursor-pointer text-sm",
                    "aria-selected:bg-sidebar-accent/70 aria-selected:text-sidebar-accent-foreground",
                  )}
                  data-testid={`command-workflow-${w.id}`}
                >
                  <Workflow className="size-3.5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{w.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {w.portfolioCompanyName} · {w.department}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-mono">
                    {workflowStatusLabel(w.status)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className="border-t border-card-border px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground/70 font-mono uppercase tracking-[0.14em]">
          <span>Navigate · ↑ ↓ · ↵ open</span>
          <span>⌘K to toggle</span>
        </div>
      </Command>
    </div>
  );
}

/** Global ⌘K / Ctrl+K listener hook. */
export function useCommandPaletteShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}
