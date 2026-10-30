import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Flag,
  Layers,
  PlusCircle,
  Sparkles,
  Wrench,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PipelineFlow, PIPELINE_NODES } from "@/components/PipelineFlow";
import { PRODUCT } from "@/lib/copy";
import { FADE_UP, STAGGER_CHILDREN } from "@/lib/motion";
import { cn } from "@/lib/utils";

const FEATURES: Array<{
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  mock: "dashboard" | "workflow" | "approvals";
}> = [
  {
    eyebrow: "01 · Cockpit",
    title: "Follow the work as it moves.",
    body: "The operational dashboard brings workflows, pending decisions and agent activity together. Open a run to inspect how it reached its recommendation.",
    bullets: [
      "Active workflows, pending approvals, agent actions today, compliance risks, cost impact — all at a glance.",
      "Recent runs are one click from the full audit trail.",
      "Agent health surfaces idle, active, and offline crew members.",
    ],
    mock: "dashboard",
  },
  {
    eyebrow: "02 · Briefing",
    title: "Every run is an executive briefing.",
    body: "Open a workflow and the right column reads like a memo: headline decision, confidence, top risks, drafted comms, and the human approval gate.",
    bullets: [
      "Synthesized brief at the top — headline, decision, confidence, risks.",
      "Risk, cost, drafted comms, and next actions as standalone panels in reading order.",
      "Sticky left rail timeline of all seven nodes with status and duration.",
    ],
    mock: "workflow",
  },
  {
    eyebrow: "03 · Approvals",
    title: "You control the final action.",
    body: "Agents can inspect and recommend. In Proof Lab, the operator reviews the source evidence and saved graph outputs before deciding whether the packet reaches the sandbox receiver.",
    bullets: [
      "Proof approvals record a note, timestamp, input fingerprint and any attached graph fingerprint.",
      "Rejection records the decision without delivery; missing evidence blocks approval.",
      "Inspect the saved decision and receiver record together; browser workspace keys are not authenticated identities.",
    ],
    mock: "approvals",
  },
];

export default function OverviewPage() {
  return (
    <PageTransition>
      <div className="px-4 sm:px-6 lg:px-8 py-10 space-y-24 max-w-[1200px] mx-auto">
        <Hero />

        <ProofJourney />

        {/* Alternating feature rows */}
        <section className="space-y-24">
          {FEATURES.map((f, i) => (
            <FeatureRow key={f.eyebrow} feature={f} reverse={i % 2 === 1} />
          ))}
        </section>

        <HowItWorks />

        <TechnicalDepth />

        <BottomCTA />

        <footer className="pt-8 border-t border-border text-xs text-muted-foreground">
          {PRODUCT.name} · Portfolio reference implementation · Built on Replit.
        </footer>
      </div>
    </PageTransition>
  );
}

/* -------------------- Hero -------------------- */

function Hero() {
  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={STAGGER_CHILDREN}
      className="surface-hero p-8 sm:p-12 lg:p-14 overflow-hidden"
    >
      <motion.div variants={FADE_UP} className="eyebrow eyebrow-accent">
        <span className="inline-flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          {PRODUCT.tagline}
        </span>
      </motion.div>
      <motion.h1
        variants={FADE_UP}
        className="font-display text-[2.75rem] sm:text-[3.75rem] lg:text-[4.25rem] font-medium tracking-[-0.03em] leading-[1.02] mt-5 max-w-4xl"
      >
        Agent workflows with{" "}
        <span className="bg-gradient-to-br from-primary via-foreground to-chart-2 bg-clip-text text-transparent">
          evidence you can inspect.
        </span>
      </motion.h1>
      <motion.p
        variants={FADE_UP}
        className="text-lg sm:text-xl text-muted-foreground mt-6 max-w-3xl leading-relaxed"
      >
        Follow a synthetic case from its source documents through specialist
        agents, human approval and a verified sandbox receipt. Open the record
        behind every step.
      </motion.p>
      <motion.div variants={FADE_UP} className="mt-8 flex flex-wrap gap-3">
        <Link href="/demo/healthcare">
          <Button size="lg" data-testid="overview-cta-demo" asChild>
            <span className="cursor-pointer">
              <PlusCircle className="size-4" />
              Start guided demo
            </span>
          </Button>
        </Link>
        <Link href="/proof-lab">
          <Button
            size="lg"
            variant="outline"
            data-testid="overview-cta-proof"
            asChild
          >
            <span className="cursor-pointer">
              Explore Proof Lab <ArrowRight className="size-4" />
            </span>
          </Button>
        </Link>
      </motion.div>

      <motion.p
        variants={FADE_UP}
        className="text-xs text-muted-foreground mt-5 leading-relaxed"
      >
        Synthetic data · no model key needed for the guided demo · first-party
        sandbox delivery
      </motion.p>
      {/* Hero pipeline */}
      <motion.div variants={FADE_UP} className="mt-12">
        <PipelineFlow ambient height={130} testId="overview-hero-pipeline" />
      </motion.div>
    </motion.section>
  );
}

function ProofJourney() {
  return (
    <section aria-labelledby="proof-journey-title" className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="eyebrow eyebrow-accent">The proof path</p>
          <h2
            id="proof-journey-title"
            className="font-display text-3xl sm:text-4xl font-medium tracking-tight mt-3"
          >
            From input to an accountable outcome.
          </h2>
        </div>
        <Link
          href="/demo/healthcare"
          className="text-sm text-primary inline-flex items-center gap-2"
        >
          Walk through a healthcare case <ArrowRight size={16} />
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          [
            "01",
            "Inspect the input",
            "Trace each check to an exact source line. Keep the failed case when corrected evidence creates a new run.",
          ],
          [
            "02",
            "Watch agents execute",
            "Run the original engine and inspect seven saved node outputs, tool records and a frozen graph fingerprint.",
          ],
          [
            "03",
            "Make the decision",
            "A person reviews and approves or rejects. The decision binds the exact source packet and graph outputs.",
          ],
          [
            "04",
            "Verify the outcome",
            "Read the sandbox receiver record independently, then export or share the saved evidence.",
          ],
        ].map(([number, title, copy]) => (
          <Card key={number} className="surface-raised p-6">
            <span className="text-xs font-mono text-primary">{number}</span>
            <h3 className="font-semibold mt-4">{title}</h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {copy}
            </p>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Authorization, revenue-cycle and vendor-invoice samples use synthetic
        data. Sandbox receipts demonstrate delivery inside Agent Ops;
        healthcare-system integrations and authenticated team access require
        further implementation.
      </p>
    </section>
  );
}

/* -------------------- Feature rows -------------------- */

function FeatureRow({
  feature,
  reverse,
}: {
  feature: (typeof FEATURES)[number];
  reverse?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn(
        "grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center",
      )}
    >
      <div className={cn(reverse ? "lg:order-2" : "")}>
        <div className="eyebrow eyebrow-accent">{feature.eyebrow}</div>
        <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-[-0.02em] mt-3 leading-[1.1]">
          {feature.title}
        </h2>
        <p className="text-muted-foreground mt-4 leading-relaxed">
          {feature.body}
        </p>
        <ul className="mt-5 space-y-2.5">
          {feature.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/90">{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn(reverse ? "lg:order-1" : "")}>
        <BrowserMock variant={feature.mock} />
      </div>
    </motion.div>
  );
}

function BrowserMock({
  variant,
}: {
  variant: "dashboard" | "workflow" | "approvals";
}) {
  return (
    <div
      className="relative surface-raised p-0 overflow-hidden"
      style={{ transform: "perspective(1200px) rotateY(-4deg) rotateX(2deg)" }}
    >
      {/* chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-card-border bg-card/60">
        <span className="size-2.5 rounded-full bg-rose-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 text-[10px] font-mono text-muted-foreground/70 tracking-wider">
          Illustrative preview ·{" "}
          {variant === "workflow"
            ? "Workflow"
            : variant === "approvals"
              ? "Approval queue"
              : "Dashboard"}
        </span>
      </div>
      {/* body */}
      <div className="p-4 sm:p-5 bg-background/50">
        {variant === "dashboard" && <MockDashboard />}
        {variant === "workflow" && <MockWorkflow />}
        {variant === "approvals" && <MockApprovals />}
      </div>
    </div>
  );
}

function MockDashboard() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {["12", "4", "187", "3", "$48K"].map((v, i) => (
          <div key={i} className="surface-raised p-2.5">
            <div className="eyebrow" style={{ fontSize: 8 }}>
              KPI
            </div>
            <div className="tnum text-lg font-semibold mt-1">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 surface-raised p-3 space-y-2">
          <div className="text-[11px] font-semibold">Recent Workflows</div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between text-[10px] py-1 border-b border-card-border/60 last:border-0"
            >
              <span className="truncate text-foreground/80">
                Acme HQ · roof repair
              </span>
              <span className="text-primary/80 font-mono tracking-wider">
                PENDING
              </span>
            </div>
          ))}
        </div>
        <div className="surface-raised p-3">
          <div className="text-[11px] font-semibold mb-2">Activity</div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1.5">
              <span className="size-1.5 rounded-full bg-primary/70 mt-1" />
              <span className="text-[9px] text-muted-foreground leading-tight">
                Ops triaged a new request
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockWorkflow() {
  return (
    <div className="grid grid-cols-5 gap-3">
      <div className="col-span-2 surface-raised p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Timeline
        </div>
        {PIPELINE_NODES.map((n, i) => (
          <div key={n.key} className="flex items-center gap-2 text-[10px]">
            <span
              className={cn(
                "size-2 rounded-full",
                i < 3
                  ? "bg-primary"
                  : i === 3
                    ? "bg-primary animate-pulse"
                    : "bg-muted-foreground/30",
              )}
            />
            <span className="flex-1 truncate">{n.label}</span>
            <span className="tnum text-muted-foreground">
              {i < 4 ? `${(i + 1) * 320}ms` : "—"}
            </span>
          </div>
        ))}
      </div>
      <div className="col-span-3 space-y-2">
        <div className="surface-raised p-3">
          <div className="eyebrow" style={{ fontSize: 8 }}>
            Executive Brief
          </div>
          <div className="text-[11px] font-semibold mt-1">
            Recommend conditional approval — capex within plan.
          </div>
          <div className="text-[9px] text-muted-foreground mt-1.5">
            Confidence 78% · 2 risks · 1 mitigation
          </div>
        </div>
        <div className="surface-raised p-3 space-y-1.5">
          <div className="text-[10px] font-semibold">Risk &amp; Compliance</div>
          <div className="h-1 rounded bg-amber-400/60 w-2/3" />
          <div className="h-1 rounded bg-rose-400/40 w-1/3" />
        </div>
      </div>
    </div>
  );
}

function MockApprovals() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="surface-raised p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-semibold truncate">
              Vendor renewal · CloudCo · $24K
            </div>
            <span className="text-[9px] font-mono tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
              MEDIUM
            </span>
          </div>
          <div className="text-[9px] text-muted-foreground mb-2">
            Recommended: approve · confidence 82%
          </div>
          <div className="flex gap-1.5">
            <span className="text-[9px] bg-primary/90 text-primary-foreground rounded px-2 py-0.5">
              Approve
            </span>
            <span className="text-[9px] border border-card-border rounded px-2 py-0.5 text-muted-foreground">
              Reject
            </span>
            <span className="text-[9px] border border-card-border rounded px-2 py-0.5 text-muted-foreground">
              Revise
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------- How it works -------------------- */

function HowItWorks() {
  const STORY: Array<{ label: string; copy: string }> = [
    {
      label: "Intake",
      copy: "Start with synthetic documents in Proof Lab or a structured operational request.",
    },
    {
      label: "Operations",
      copy: "Ops Conductor classifies the request and routes it to the right specialists.",
    },
    {
      label: "Memory",
      copy: "The Node graph retrieves matching knowledge chunks with keyword search.",
    },
    {
      label: "Legal",
      copy: "Legal produces an advisory risk review; demo mode uses labelled preset outputs.",
    },
    {
      label: "Finance",
      copy: "Finance produces structured estimates. Demo estimates are illustrations, not source facts.",
    },
    {
      label: "Comms",
      copy: "Communications prepares draft messaging. Its simulated tool records do not send it.",
    },
    {
      label: "Approval",
      copy: "Proof Lab binds approval to the saved evidence and graph; the final node records the decision.",
    },
  ];
  return (
    <section className="space-y-6">
      <div className="eyebrow eyebrow-accent">How it works</div>
      <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-[-0.02em] max-w-3xl">
        Seven review nodes. A human gate. A final decision.
      </h2>
      <Card className="surface-raised p-6 sm:p-8">
        <PipelineFlow ambient height={140} testId="overview-howit-pipeline" />
      </Card>
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex gap-3 min-w-max">
          {STORY.map((s, i) => (
            <div
              key={s.label}
              className="surface-raised p-4 w-[240px] shrink-0"
              data-testid={`overview-story-${s.label.toLowerCase()}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="size-5 rounded-full bg-primary/15 text-primary text-[10px] font-mono tnum flex items-center justify-center">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold">{s.label}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {s.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------- Technical depth -------------------- */

const PILLARS: Array<{ icon: typeof Bot; title: string; body: string }> = [
  {
    icon: Bot,
    title: "Multi-agent triage",
    body: "A coordinated crew of specialist agents — Ops, Legal, Finance, Communications, Memory — review every request in sequence, each producing structured output, risks, and confidence.",
  },
  {
    icon: Flag,
    title: "Human-in-the-loop approvals",
    body: "Review the evidence and graph outputs before delivery. Approve or reject an immutable packet; a failed rule or incomplete graph keeps approval locked.",
  },
  {
    icon: BookOpen,
    title: "Shared memory",
    body: "A keyword-search memory layer lets agents ground their reasoning in real policy documents, with retrieved chunks surfaced as evidence on the run.",
  },
  {
    icon: Wrench,
    title: "Verified sandbox delivery",
    body: "An approved packet is sent over HTTP to the first-party receiver, then checked with a separate GET. Original graph tools are labelled real keyword retrieval or simulation.",
  },
  {
    icon: Activity,
    title: "Traceable audit log",
    body: "Every state transition, agent decision, and operator action is recorded. Open any workflow and replay it step by step.",
  },
  {
    icon: Layers,
    title: "Shareable proof & evaluations",
    body: "Export JSON or a printable evidence pack, create expiring and revocable viewer links, and compare saved six-case evaluations. Inspect failure recovery as well as successful delivery.",
  },
];

function TechnicalDepth() {
  return (
    <section className="space-y-8">
      <div>
        <div className="eyebrow eyebrow-accent">The depth underneath</div>
        <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-[-0.02em] max-w-3xl mt-3">
          The implementation behind the walkthrough.
        </h2>
        <p className="text-muted-foreground mt-4 max-w-3xl leading-relaxed">
          Typed contracts, saved execution snapshots and explicit human gates
          make the workflow inspectable. Demo output, live model output and
          actual HTTP delivery are labelled separately, so you can see what each
          result demonstrates.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.title} className="surface-raised p-5">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">
                    {p.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="surface-raised p-6">
        <div className="eyebrow mb-3">The stack</div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {[
            [
              "TypeScript monorepo",
              "pnpm workspaces, single toolchain front-to-back",
            ],
            [
              "API contract",
              "OpenAPI → React Query hooks + Zod validators (orval)",
            ],
            ["Backend", "Express 5 + Drizzle + PostgreSQL"],
            ["Frontend", "React + Vite + TanStack Query + shadcn/ui"],
            ["Orchestrator", "Deterministic state machine; LLM-optional"],
            [
              "Demo mode",
              "No model key needed; database and agent setup required",
            ],
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
      <div>
        <Link href="/architecture">
          <Button
            variant="outline"
            size="sm"
            data-testid="overview-cta-architecture"
            asChild
          >
            <span className="cursor-pointer">
              See the technical architecture <ArrowRight className="size-4" />
            </span>
          </Button>
        </Link>
      </div>
    </section>
  );
}

/* -------------------- Bottom CTA -------------------- */

function BottomCTA() {
  return (
    <section className="surface-hero p-8 sm:p-12 text-center">
      <div className="eyebrow eyebrow-accent">See the complete workflow</div>
      <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-[-0.02em] mt-3 max-w-2xl mx-auto">
        Follow one case. Inspect every handoff.
      </h2>
      <div className="mt-6 flex flex-wrap gap-3 justify-center">
        <Link href="/demo/healthcare">
          <Button size="lg" data-testid="overview-bottom-cta" asChild>
            <span className="cursor-pointer">
              <Sparkles className="size-4" />
              Start guided demo
            </span>
          </Button>
        </Link>
        <Link href="/evaluations">
          <Button size="lg" variant="outline" asChild>
            <span className="cursor-pointer">
              Inspect evaluations <ArrowRight className="size-4" />
            </span>
          </Button>
        </Link>
      </div>
    </section>
  );
}
