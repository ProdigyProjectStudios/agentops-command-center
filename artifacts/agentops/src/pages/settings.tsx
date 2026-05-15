import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import {
  Bot,
  Building2,
  CheckCircle2,
  Key,
  Loader2,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import {
  useListCompanies,
  useCreateCompany,
  useGetSystemMode,
  useListAgents,
  getListCompaniesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";

export default function SettingsPage() {
  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6 max-w-[1100px] mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Admin Settings
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure portfolio companies, agent crew, and system mode.
        </p>
      </div>

      <Tabs defaultValue="companies">
        <TabsList data-testid="tabs-settings">
          <TabsTrigger value="companies" data-testid="tab-companies">
            <Building2 className="size-3.5" /> Portfolio Companies
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Bot className="size-3.5" /> Agent Configuration
          </TabsTrigger>
          <TabsTrigger value="system" data-testid="tab-system">
            <SettingsIcon className="size-3.5" /> System
          </TabsTrigger>
        </TabsList>
        <TabsContent value="companies" className="mt-5">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="agents" className="mt-5">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="system" className="mt-5">
          <SystemTab />
        </TabsContent>
      </Tabs>
    </div>
    </PageTransition>
  );
}

function CompaniesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: companies, isLoading } = useListCompanies();
  const [form, setForm] = useState({ name: "", slug: "", industry: "", description: "" });

  const create = useCreateCompany({
    mutation: {
      onSuccess: (company) => {
        toast({ title: "Company added", description: company.name });
        setForm({ name: "", slug: "", industry: "", description: "" });
        queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      },
      onError: (e) => {
        toast({
          title: "Could not add company",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim() || !form.industry.trim()) {
      toast({ title: "Name, slug, and industry are required", variant: "destructive" });
      return;
    }
    create.mutate({ data: form });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-5 bg-card border-card-border">
        <h3 className="text-sm font-semibold mb-3">Companies ({companies?.length ?? 0})</h3>
        {isLoading && <Skeleton className="h-32 w-full" />}
        <div className="space-y-2">
          {(companies ?? []).map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-md border border-card-border bg-background/40 flex items-start gap-3"
              data-testid={`company-row-${c.slug}`}
            >
              <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.industry} · <code className="text-[11px]">{c.slug}</code>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {c.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 bg-card border-card-border">
        <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
          <Plus className="size-4" /> Add Company
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs" htmlFor="co-name">Name</Label>
            <Input
              id="co-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1"
              data-testid="input-company-name"
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="co-slug">Slug</Label>
            <Input
              id="co-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="mt-1"
              placeholder="acme-co"
              data-testid="input-company-slug"
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="co-industry">Industry</Label>
            <Input
              id="co-industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="mt-1"
              data-testid="input-company-industry"
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="co-desc">Description</Label>
            <Input
              id="co-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1"
              data-testid="input-company-description"
            />
          </div>
          <Button
            type="submit"
            disabled={create.isPending}
            className="w-full"
            data-testid="button-add-company"
          >
            {create.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Add Company
          </Button>
        </form>
      </Card>
    </div>
  );
}

function AgentsTab() {
  const { data, isLoading } = useListAgents();
  return (
    <Card className="p-5 bg-card border-card-border">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Agent Crew</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Read-only configuration. Tweaking per-agent prompts and tool grants is coming soon.
        </p>
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      <div className="space-y-3">
        {(data ?? []).map((agent) => (
          <div
            key={agent.id}
            className="p-4 rounded-md border border-card-border bg-background/40"
            data-testid={`agent-config-${agent.slug}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium">{agent.name}</div>
                <div className="text-xs text-muted-foreground">{agent.role}</div>
              </div>
              <code className="text-[11px] bg-muted px-2 py-0.5 rounded">{agent.slug}</code>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Capabilities</div>
                <div className="flex flex-wrap gap-1">
                  {agent.capabilities.map((c) => (
                    <span key={c} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[11px]">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Tools</div>
                <div className="flex flex-wrap gap-1">
                  {agent.tools.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground text-[11px]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SystemTab() {
  const { data: mode, isLoading } = useGetSystemMode();
  const isDemo = mode?.mode === "demo";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="p-5 bg-card border-card-border">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Run Mode</h3>
        </div>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge
                className={
                  isDemo
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                }
                testId="badge-current-mode"
              >
                {mode?.mode?.toUpperCase()}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">
                Current system mode
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isDemo
                ? "Agents return curated, scripted reasoning so the demo is repeatable. To switch to live LLM mode, add an OPENAI_API_KEY environment secret and restart the API server."
                : "Agents call the live LLM provider for reasoning. Costs and latency are real."}
            </p>
          </>
        )}
      </Card>

      <Card className="p-5 bg-card border-card-border">
        <div className="flex items-center gap-2 mb-3">
          <Key className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">API Key Status</h3>
        </div>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="flex items-center gap-2">
            {mode?.hasApiKey ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-300" />
                <span className="text-sm" data-testid="text-api-key-status">
                  OpenAI API key detected
                </span>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-rose-400" />
                <span className="text-sm text-muted-foreground" data-testid="text-api-key-status">
                  No OpenAI API key configured (demo mode active)
                </span>
              </>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Keys are never displayed in the UI. AgentOps only checks whether a key is present.
        </p>
      </Card>
    </div>
  );
}
