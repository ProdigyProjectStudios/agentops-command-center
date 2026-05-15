import { useState } from "react";
import { useLocation } from "wouter";
import { PageTransition } from "@/components/PageTransition";
import { Sparkles, Send, Loader2 } from "lucide-react";
import {
  useListCompanies,
  useCreateRequest,
  type OperationalRequestInput,
  type Priority,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const DEMO_PRESET = {
  title: "Approve $48K roofing contractor for Acme HQ",
  department: "Facilities",
  priority: "high" as Priority,
  requestedBy: "Jamie Lin (COO)",
  description:
    "We need to engage Skyline Roofing for a $48,000 emergency roof repair at the Acme HQ campus. Please run full triage: vendor risk, contract red flags, budget impact vs. Q3 OPEX plan, and draft an exec-ready summary plus a stakeholder communication. Procurement policy requires CFO approval above $25K.",
};

export default function NewRequestPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: companies, isLoading: companiesLoading } = useListCompanies();

  const [form, setForm] = useState<OperationalRequestInput>({
    portfolioCompanyId: 0,
    title: "",
    description: "",
    department: "",
    priority: "medium",
    requestedBy: "",
  });

  const createRequest = useCreateRequest({
    mutation: {
      onSuccess: (created) => {
        toast({
          title: "Request submitted",
          description: `Workflow run #${created.workflowRunId} created. Routing to detail view…`,
        });
        setLocation(`/workflows/${created.workflowRunId}`);
      },
      onError: (err) => {
        toast({
          title: "Could not submit request",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      },
    },
  });

  function loadDemoPreset() {
    const acme = companies?.find((c) => c.slug === "acme-co") ?? companies?.[0];
    setForm({
      portfolioCompanyId: acme?.id ?? 0,
      ...DEMO_PRESET,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.portfolioCompanyId) {
      toast({
        title: "Pick a portfolio company",
        variant: "destructive",
      });
      return;
    }
    createRequest.mutate({ data: form });
  }

  const submitting = createRequest.isPending;

  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            New Operational Request
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            File a request for the multi-agent ops crew to triage, analyze, and route for approval.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadDemoPreset}
          disabled={companiesLoading}
          data-testid="button-load-demo"
        >
          <Sparkles className="size-4" />
          Load Roofing Contractor Demo
        </Button>
      </div>

      <Card className="p-6 bg-card border-card-border">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Portfolio Company</Label>
              <Select
                value={form.portfolioCompanyId ? String(form.portfolioCompanyId) : ""}
                onValueChange={(v) => setForm((f) => ({ ...f, portfolioCompanyId: Number(v) }))}
              >
                <SelectTrigger id="company" data-testid="select-company">
                  <SelectValue placeholder="Choose a company" />
                </SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map((c) => (
                    <SelectItem
                      key={c.id}
                      value={String(c.id)}
                      data-testid={`option-company-${c.slug}`}
                    >
                      {c.name} <span className="text-muted-foreground">· {c.industry}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Facilities, Finance, Legal"
                data-testid="input-department"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Request Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What needs a decision?"
              data-testid="input-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Give the agents enough context — budget, vendor, deadline, constraints…"
              rows={6}
              data-testid="input-description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}
              >
                <SelectTrigger id="priority" data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low" data-testid="option-priority-low">Low</SelectItem>
                  <SelectItem value="medium" data-testid="option-priority-medium">Medium</SelectItem>
                  <SelectItem value="high" data-testid="option-priority-high">High</SelectItem>
                  <SelectItem value="urgent" data-testid="option-priority-urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requestedBy">Requested By</Label>
              <Input
                id="requestedBy"
                value={form.requestedBy}
                onChange={(e) => setForm((f) => ({ ...f, requestedBy: e.target.value }))}
                placeholder="Your name & role"
                data-testid="input-requested-by"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setLocation("/")} data-testid="button-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} data-testid="button-submit">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Submit & Run Agents
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
    </PageTransition>
  );
}
