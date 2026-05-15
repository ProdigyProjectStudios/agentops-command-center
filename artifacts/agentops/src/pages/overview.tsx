import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Flag,
  GitBranch,
  Layers,
  Megaphone,
  PlusCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRODUCT } from "@/lib/copy";

const PIPELINE = [
  { key: "triage", label: "Triage", icon: GitBranch, blurb: "Ops Conductor classifies the request and routes it to the right specialists." },
  { key: "memory", label: "Memory", icon: BookOpen, blurb: "Memory agent grounds the run in policy docs and prior decisions." },
  { key: "legal", label: "Legal", icon: Scale, blurb: "Legal Counsel checks contract terms, compliance, and red flags." },
  { key: "finance", label: "Finance", icon: ShieldCheck, blurb: "Finance fits cost into the operating plan and forecasts impact." },
  { key: "comms", label: "Comms", icon: Megaphone, blurb: "Communications drafts internal and external messaging." },
  { key: "synthesis", label: "Synthesis", icon: Sparkles, blurb: "Risk Synthesis composes the final executive brief." },
  { key: "approval", label: "Approval", icon: Flag, blurb: "A human signs off — approve, conditionally approve, or reject." },
];

const PILLARS: Array<{ icon: typeof Bot; title: string; body: string }> = [
  {
    icon: Bot,
    title: "Multi-agent triage",
    body: "A coordinated crew of specialist agents — Ops, Legal, Finance, Communications, Memory — review every request in sequence, each producing structured output, risks, and confidence.",
  },
  {
    icon: Flag,
    title: "Human-in-the-loop approvals",
    body: "Nothing executes without a human sign-off. The approval card shows the recommendation, key evidence, risks, and an explicit decide / reject / request-revision flow.",
  },
  {
    icon: BookOpen,
    title: "Shared memory",
    body: "A keyword-search memory layer lets agents ground their reasoning in real policy documents, with retrieved chunks surfaced as evidence on the run.",
  },
  {
    icon: Wrench,
    title: "Tool execution",
    body: "Every external call an agent makes is captured as a typed ToolCall row — input, output, status, duration — and wired into the audit ledger.",
  },
  {
    icon: Activity,
    title: "Traceable audit log",
    body: "Every state transition, agent decision, and operator action is recorded. Open any workflow and replay it step by step.",
  },
  {
    icon: Layers,
    title: "Portfolio visibility",
    body: "All requests roll up into a portfolio dashboard — active workflows, pending approvals, agent actions today, compliance risks, cost impact.",
  },
];

export default function OverviewPage() {
  return (
    <PageTransition>
      <div className="px-4 sm:px-6 lg:px-8 py-10 space-y-12 max-w-[1100px] mx-auto">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="space-y-5"
        >
          <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-medium">
            {PRODUCT.tagline}
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
            A reference architecture for{" "}
            <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
              multi-agent enterprise ops.
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
            AgentOps Command Center is a working demo of how a small crew of specialized AI
            agents can triage incoming operational requests, run them through legal, finance,
            and communications review, ground their reasoning in a knowledge base, and land
            at a human approval gate — with a clear recommendation, risk level, and full
            audit trail.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/requests/new">
              <Button size="lg" data-testid="overview-cta-demo" asChild>
                <span className="cursor-pointer">
                  <PlusCircle className="size-4" />
                  Run the demo
                </span>
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" data-testid="overview-cta-dashboard" asChild>
                <span className="cursor-pointer">
                  Open the cockpit <ArrowRight className="size-4" />
                </span>
              </Button>
            </Link>
          </div>
        </motion.section>

        {/* Problem */}
        <section className="space-y-4">
          <SectionEyebrow>The problem</SectionEyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">
            Operations teams drown in approval queues.
          </h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed">
            Vendor contracts, ad spend, hiring asks, facilities work, legal reviews —
            every one of them needs a quick risk read, a budget check, a draft comms
            note, and a paper trail. A modern operating company files dozens of these
            a week. Most of the work is not the decision; it's the assembly of evidence
            that lets a human make the decision quickly and defensibly. AgentOps wires
            that assembly into a single deterministic pipeline you can audit step by step.
          </p>
        </section>

        {/* Pipeline */}
        <section className="space-y-5">
          <SectionEyebrow>The core workflow</SectionEyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">Seven nodes, one record.</h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed">
            Every request flows through the same pipeline. Each node persists a typed
            agent_step, the tools it called, the activity it generated, and a confidence
            score. Nothing is hidden — the workflow detail page lets you expand every
            step's input, output, and tool calls.
          </p>
          <Card className="p-6 bg-card border-card-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {PIPELINE.map((n, i) => {
                const Icon = n.icon;
                return (
                  <div key={n.key} className="relative">
                    <div className="rounded-lg border border-card-border bg-background/40 p-3 h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="size-7 rounded-md bg-primary/15 text-primary flex items-center justify-center">
                          <Icon className="size-3.5" />
                        </div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="text-sm font-medium">{n.label}</div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                        {n.blurb}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        {/* Pillars */}
        <section className="space-y-5">
          <SectionEyebrow>What's inside</SectionEyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">Six pillars, one platform.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PILLARS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
                >
                  <Card className="p-5 bg-card border-card-border h-full">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0",
                      )}>
                        <Icon className="size-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">{p.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {p.body}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Stack */}
        <section className="space-y-4">
          <SectionEyebrow>The stack</SectionEyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">Boring on purpose.</h2>
          <Card className="p-6 bg-card border-card-border">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {[
                ["TypeScript monorepo", "pnpm workspaces, single toolchain front-to-back"],
                ["API contract", "OpenAPI → React Query hooks + Zod validators (orval)"],
                ["Backend", "Express 5 + Drizzle + PostgreSQL"],
                ["Frontend", "React + Vite + TanStack Query + shadcn/ui"],
                ["Orchestrator", "Deterministic state machine; LLM-optional"],
                ["Demo mode", "Always works without an API key"],
              ].map(([k, v]) => (
                <li key={k} className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{k}</span>
                    <span className="text-muted-foreground"> — {v}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* Why it matters */}
        <section className="space-y-4">
          <SectionEyebrow>Why it matters</SectionEyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">
            Enterprise AI lives or dies on auditability.
          </h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed">
            "Magic" agents that produce a single black-box answer don't survive procurement,
            legal, or risk review at a real company. AgentOps treats every agent action as a
            first-class record: typed output, retrieved evidence, tool calls, confidence,
            and the human decision that closed the loop. The result is an architecture you
            could plausibly ship to an operating company tomorrow — same shape, different
            agent prompts, real data sources swapped in.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/requests/new">
              <Button size="lg" data-testid="overview-bottom-cta" asChild>
                <span className="cursor-pointer">
                  <Sparkles className="size-4" />
                  Try a sample request
                </span>
              </Button>
            </Link>
            <Link href="/workflows">
              <Button size="lg" variant="outline" asChild>
                <span className="cursor-pointer">
                  Browse workflows <ArrowRight className="size-4" />
                </span>
              </Button>
            </Link>
          </div>
        </section>

        <footer className="pt-6 border-t border-border text-xs text-muted-foreground">
          AgentOps Command Center · Portfolio reference implementation · Built on Replit.
        </footer>
      </div>
    </PageTransition>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-medium">
      {children}
    </div>
  );
}
