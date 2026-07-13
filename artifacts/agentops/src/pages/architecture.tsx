import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Boxes,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  Database,
  FileLock2,
  GitBranch,
  KeyRound,
  Layers,
  Link2,
  Lock,
  MessageSquare,
  Mic,
  Network,
  Phone,
  Radio,
  RefreshCw,
  Scale,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PipelineFlow } from "@/components/PipelineFlow";

export default function ArchitecturePage() {
  return (
    <PageTransition>
      <div className="px-4 sm:px-6 lg:px-8 py-10 space-y-14 max-w-[1200px] mx-auto">
        <Hero />
        <DesignPrinciple />
        <CurrentArchitecture />
        <ProductionExtension />
        <AgentGraph />
        <VectorMemory />
        <IntegrationAdapters />
        <ApprovalModel />
        <AuditModel />
        <Security />
        <PythonHardening />
        <Footer />
      </div>
    </PageTransition>
  );
}

/* ----------------------------- Sections ------------------------------ */

function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
      className="space-y-5"
    >
      <Eyebrow>Technical architecture</Eyebrow>
      <h1 className="font-display text-[2.5rem] sm:text-[3.25rem] font-medium tracking-[-0.025em] leading-[1.06]">
        From a TypeScript demo to a{" "}
        <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
          production Python/LangGraph
        </span>{" "}
        agent platform.
      </h1>
      <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
        AgentOps is intentionally modular. The current demo runs a deterministic
        TypeScript LangGraph-style state machine for fast portfolio
        visualisation. Every contract on the page below — workflow state,
        approval envelope, agent_step ledger, tool-call ledger, audit log — was
        designed so the orchestration layer can be lifted out and replaced with a
        production Python/LangGraph worker without changing the UI, the
        database, or the API surface.
      </p>
      <div className="pt-4">
        <PipelineFlow
          height={150}
          ambient
          testId="architecture-pipeline-flow"
        />
      </div>
    </motion.section>
  );
}

function DesignPrinciple() {
  return (
    <Card className="p-6 bg-gradient-to-br from-primary/10 via-card to-chart-2/10 border-primary/30">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-md bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="size-5" />
        </div>
        <p className="text-sm sm:text-base leading-relaxed text-foreground/90 italic">
          AgentOps is intentionally designed as a modular agent orchestration
          platform. The current demo uses a TypeScript LangGraph-style state
          machine for rapid visualization and product validation. In production,
          the orchestration layer can be swapped or extended with
          Python/LangGraph while preserving the same workflow state, approval,
          memory, and audit-log architecture.
        </p>
      </div>
    </Card>
  );
}

/* ----- Current architecture diagram ----- */

function CurrentArchitecture() {
  return (
    <section className="space-y-5">
      <Eyebrow>Current demo architecture</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        One TypeScript monorepo, end to end.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        Today the orchestrator lives next to the API in a single Node/Express
        process. This keeps the demo deterministic, debuggable, and bulletproof
        — every component is one toolchain away from any other.
      </p>

      <Card className="p-6 bg-card border-card-border overflow-x-auto">
        <div className="min-w-[720px] flex items-stretch gap-3">
          <DiagramNode
            icon={Code2}
            title="React + Vite"
            sub="Command Center UI"
            tone="primary"
          />
          <DiagramArrow label="REST / OpenAPI" />
          <DiagramNode
            icon={Server}
            title="Express 5 + TS"
            sub="API + orchestrator"
            tone="primary"
          />
          <DiagramArrow label="Drizzle" />
          <DiagramNode
            icon={Database}
            title="PostgreSQL"
            sub="state · audit · memory"
            tone="muted"
          />
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <Bullet>
            8-node state graph in <Code>src/orchestration/</Code>
          </Bullet>
          <Bullet>
            Typed envelopes persisted to <Code>agent_steps.output</Code>
          </Bullet>
          <Bullet>
            Demo mode &amp; LLM fallback in <Code>lib/llm.ts</Code>
          </Bullet>
        </div>
      </Card>
    </section>
  );
}

/* ----- Production extension diagram ----- */

function ProductionExtension() {
  return (
    <section className="space-y-5">
      <Eyebrow>Production extension path</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        Drop in a Python/LangGraph worker without touching the UI or database.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        For a real deployment, the orchestrator becomes its own worker service —
        Python + FastAPI + LangGraph — talking to the same Postgres database
        and exposing the same workflow contract. The Express API becomes a thin
        edge: auth, request validation, queueing runs, returning workflow
        state. Everything the UI reads stays identical.
      </p>

      <Card className="p-6 bg-card border-card-border overflow-x-auto">
        <div className="min-w-[860px] grid grid-cols-12 gap-3 items-stretch">
          {/* Row 1: Edge */}
          <div className="col-span-3">
            <DiagramNode
              icon={Code2}
              title="React + Vite"
              sub="UI (unchanged)"
              tone="primary"
              fullHeight
            />
          </div>
          <div className="col-span-1 flex items-center justify-center">
            <Chevron />
          </div>
          <div className="col-span-3">
            <DiagramNode
              icon={Server}
              title="Express edge API"
              sub="auth · validation · queue"
              tone="primary"
              fullHeight
            />
          </div>
          <div className="col-span-1 flex items-center justify-center">
            <Chevron />
          </div>
          <div className="col-span-4">
            <DiagramNode
              icon={Workflow}
              title="Python FastAPI + LangGraph worker"
              sub="agent graph · tool runtime"
              tone="accent"
              fullHeight
            />
          </div>

          {/* Spacer connector row */}
          <div className="col-span-12 h-2" />

          {/* Row 2: Shared infra */}
          <div className="col-span-12 grid grid-cols-3 gap-3">
            <DiagramNode
              icon={Database}
              title="PostgreSQL"
              sub="workflows · agent_steps · approvals · audit"
              tone="muted"
            />
            <DiagramNode
              icon={Brain}
              title="Vector store"
              sub="pgvector · Pinecone · Weaviate"
              tone="muted"
            />
            <DiagramNode
              icon={Network}
              title="Integration adapters"
              sub="CRM · ERP · finance · HR · email · Slack · docs"
              tone="muted"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <Bullet>
            The worker reads/writes the same tables as the demo orchestrator —
            the UI does not know whether a run was processed by Node TypeScript
            or Python LangGraph.
          </Bullet>
          <Bullet>
            Run dispatch via a job queue (Postgres LISTEN/NOTIFY, Redis, SQS)
            keeps the API responsive during long agent runs.
          </Bullet>
          <Bullet>
            The Python worker imports LangGraph for the graph runtime and
            LangChain (or LiteLLM) for model + tool abstractions.
          </Bullet>
          <Bullet>
            Schema migrations live in <Code>lib/db</Code> and are applied once;
            both runtimes read the same Drizzle-defined tables.
          </Bullet>
        </div>
      </Card>
    </section>
  );
}

/* ----- Agent graph ----- */

const NODES: Array<{
  key: string;
  label: string;
  icon: typeof Workflow;
  blurb: string;
}> = [
  {
    key: "ops",
    label: "Ops Conductor",
    icon: GitBranch,
    blurb:
      "Classifies the incoming request, selects which specialists to fan out to, and tags risk hints.",
  },
  {
    key: "memory",
    label: "Memory",
    icon: Brain,
    blurb:
      "Keyword + vector retrieval across policy, prior decisions, contracts, and ticket history.",
  },
  {
    key: "legal",
    label: "Legal",
    icon: Scale,
    blurb:
      "Contract terms, regulatory exposure, sanctions/PEP screens, IP and data-handling concerns.",
  },
  {
    key: "finance",
    label: "Finance",
    icon: ShieldCheck,
    blurb:
      "Budget fit, cash-flow timing, vendor concentration, ROI & alternative-cost framing.",
  },
  {
    key: "marketing",
    label: "Marketing / Comms",
    icon: MessageSquare,
    blurb:
      "Internal note, customer-facing copy, brand-voice check, channel-specific drafts.",
  },
  {
    key: "approval",
    label: "Approval",
    icon: Users,
    blurb:
      "Human-in-the-loop gate. Surfaces synthesis brief, evidence, risks, and a decide flow.",
  },
  {
    key: "finalize",
    label: "Finalization",
    icon: CheckCircle2,
    blurb:
      "Triggers downstream actions through adapters, writes the final outcome, closes the audit trail.",
  },
];

function AgentGraph() {
  return (
    <section className="space-y-5">
      <Eyebrow>Agent graph</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        Specialist agents over a shared workflow state.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        Each node consumes the shared <Code>WorkflowState</Code>, contributes a
        typed <Code>AgentOutput</Code> envelope, and may emit zero or more{" "}
        <Code>ToolCall</Code> records. Whether implemented as TypeScript
        functions or LangGraph Python nodes, the contract is identical —
        synthesis is the canonical source of the final brief, approval is a
        first-class human gate, and finalization is where downstream effects
        actually happen.
      </p>

      <Card className="p-6 bg-card border-card-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {NODES.map((n, i) => {
            const Icon = n.icon;
            return (
              <motion.div
                key={n.key}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.18, delay: i * 0.04, ease: [0.22, 0.61, 0.36, 1] }}
                className="rounded-lg border border-card-border bg-background/40 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center">
                    <Icon className="size-4" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="text-sm font-medium">{n.label}</div>
                <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
                  {n.blurb}
                </p>
              </motion.div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

/* ----- Vector memory ----- */

function VectorMemory() {
  return (
    <section className="space-y-5">
      <Eyebrow>Vector memory upgrade</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        Swap keyword search for semantic retrieval without changing callers.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        The demo's <Code>lib/memory/keyword-search.ts</Code> exposes a single
        <Code> searchMemory(query, k)</Code> contract that returns ranked hits
        plus a recorded <Code>memory_search</Code> tool call. The same function
        signature can be backed by a vector index — Memory upgrades become an
        adapter swap, not a rewrite.
      </p>
      <Card className="p-4 bg-card/50 border-card-border">
        <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
          <div className="mt-0.5 inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md bg-emerald-500/15 px-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            End-to-end · verified
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
            <p>
              Chunking, embedding, and cosine-similarity retrieval are wired
              end-to-end and tested against the live database. Each document on
              the Knowledge page has a{" "}
              <strong className="text-foreground">Generate embeddings</strong>{" "}
              action that chunks the document content, generates a 1536-dim
              embedding via the Python worker, and writes the result into{" "}
              <Code>memory_chunks</Code> with{" "}
              <Code>has_embedding: true</Code>. The Knowledge page's search
              then calls{" "}
              <Code>POST /api/knowledge/search</Code>, which runs a real{" "}
              <Code>mc.embedding &lt;=&gt; query_vector</Code> cosine-similarity
              query directly against pgvector — not a client-side simulation.
            </p>
            <p>
              This was verified end-to-end against the live database: real
              similarity scores are returned and correctly ranked. For example,
              a query for budget-related content surfaces the budget-governance
              document highest (score 0.5884) ahead of unrelated documents —
              ranking that changes correctly as the query changes.
            </p>
            <p>
              Without a live OpenAI API key the system falls back to a
              deterministic SHA-256-seeded pseudo-embedding, keeping search
              behavior reproducible in demo mode. With a real key it calls{" "}
              <Code>text-embedding-3-small</Code> directly — same code path,
              no configuration change required. If no embeddings exist for any
              document, search degrades gracefully to ILIKE keyword matching
              and says so explicitly in the UI.
            </p>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UpgradeCard
          title="pgvector"
          tag="In-cluster"
          body="Add a vector column to memory_chunks, reuse the existing Postgres connection. Lowest ops overhead, ideal first step."
        />
        <UpgradeCard
          title="Pinecone"
          tag="Managed SaaS"
          body="Hosted ANN index with metadata filtering and namespaces — natural fit for multi-tenant deployments."
        />
        <UpgradeCard
          title="Weaviate"
          tag="Self-host or managed"
          body="Hybrid search out of the box (dense + BM25), built-in re-rankers, GraphQL surface for richer queries."
        />
      </div>
      <Card className="p-5 bg-card border-card-border">
        <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
          Document ingest pipeline
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill icon={ScrollText}>Source docs</Pill>
          <Chevron compact />
          <Pill icon={Layers}>Chunk &amp; embed</Pill>
          <Chevron compact />
          <Pill icon={Database}>memory_chunks + vector</Pill>
          <Chevron compact />
          <Pill icon={Brain}>Memory agent retrieval</Pill>
        </div>
      </Card>
    </section>
  );
}

function UpgradeCard({
  title,
  tag,
  body,
}: {
  title: string;
  tag: string;
  body: string;
}) {
  return (
    <Card className="p-5 bg-card border-card-border h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[10px] uppercase tracking-wider text-primary/80 bg-primary/10 rounded px-2 py-0.5">
          {tag}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </Card>
  );
}

/* ----- Integration adapters ----- */

const ADAPTERS = [
  { label: "CRM", examples: "Salesforce · HubSpot", icon: Users },
  { label: "ERP", examples: "NetSuite · SAP", icon: Boxes },
  { label: "Finance", examples: "Stripe · QuickBooks · Mercury", icon: Database },
  { label: "HR systems", examples: "Workday · Rippling · BambooHR", icon: Users },
  { label: "Email", examples: "SendGrid · Postmark · M365", icon: MessageSquare },
  { label: "Slack / chat", examples: "Slack · Teams", icon: MessageSquare },
  { label: "Document storage", examples: "Drive · SharePoint · S3", icon: ScrollText },
];

function IntegrationAdapters() {
  return (
    <section className="space-y-5">
      <Eyebrow>Integration adapter layer</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        One adapter contract, many systems of record.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        Tools the agents call are typed adapters with a stable interface (
        <Code>execute(input) → output</Code>) and centralised credential
        injection. Every invocation lands in the <Code>tool_calls</Code> table —
        same row whether the adapter is talking to a sandbox or a production
        system of record. Swapping a stub for a real Salesforce client is a
        registry change, not a code refactor.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ADAPTERS.map((a) => {
          const Icon = a.icon;
          return (
            <div
              key={a.label}
              className="rounded-lg border border-card-border bg-card p-4 flex items-start gap-3"
            >
              <div className="size-9 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{a.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {a.examples}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ----- Approval ----- */

function ApprovalModel() {
  return (
    <section className="space-y-5">
      <Eyebrow>Human-in-the-loop approvals</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        No agent action lands without a human decision.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        Approval is a <em>node</em>, not a callback. Synthesis writes a typed
        brief into <Code>WorkflowState</Code>; the engine creates an{" "}
        <Code>approval_requests</Code> row and pauses the graph. The UI surfaces
        the brief, evidence, risks, and recommendation; an operator decides; the
        engine resumes from the next node with the decision attached to state.
      </p>
      <Card className="p-6 bg-card border-card-border overflow-x-auto">
        <div className="min-w-[640px] flex items-stretch gap-2">
          <FlowStep n="1" label="Agents run" sub="ops → … → synthesis" />
          <FlowConnector />
          <FlowStep n="2" label="Approval gate" sub="brief + evidence" highlight />
          <FlowConnector />
          <FlowStep n="3" label="Human decides" sub="approve · reject · revise" />
          <FlowConnector />
          <FlowStep n="4" label="Finalize" sub="adapters fire · audit closes" />
        </div>
      </Card>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        {[
          "Per-workflow approval thresholds (e.g. spend > $10k requires VP).",
          "Multi-party approvals: legal + finance both required for contracts.",
          "Revise-and-replay: operator can edit context and re-run downstream nodes only.",
          "Out-of-band channels: approval prompts surface in Slack/email; decision posts back to the workflow.",
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----- Audit ----- */

function AuditModel() {
  return (
    <section className="space-y-5">
      <Eyebrow>Audit log &amp; tool-call traceability</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        Every byte an agent produced or consumed is replayable.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        Three append-only ledgers carry the full audit story. Together they let
        an operator (or a regulator) reconstruct exactly what each agent saw,
        chose, and did — and which human approved it.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <LedgerCard
          icon={Workflow}
          name="agent_steps"
          desc="One row per agent run within a workflow. Stores the typed AgentOutput envelope, confidence, risk score, fallback metadata, and timing."
        />
        <LedgerCard
          icon={Link2}
          name="tool_calls"
          desc="One row per external invocation (memory search, adapter call). Captures input, output, status, and duration; linked to the agent_step that issued it."
        />
        <LedgerCard
          icon={ScrollText}
          name="activity_logs"
          desc="One row per state transition or operator action. Actor (system / agent / user), action verb, message, structured metadata."
        />
      </div>
    </section>
  );
}

function LedgerCard({
  icon: Icon,
  name,
  desc,
}: {
  icon: typeof Workflow;
  name: string;
  desc: string;
}) {
  return (
    <Card className="p-5 bg-card border-card-border h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center">
          <Icon className="size-4" />
        </div>
        <Code>{name}</Code>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </Card>
  );
}

/* ----- Security ----- */

const SECURITY = [
  {
    icon: Lock,
    title: "RBAC",
    body: "Role-scoped access for operators, approvers, auditors, and admins. Routes and approval actions enforced server-side; UI mirrors the same matrix.",
  },
  {
    icon: Boxes,
    title: "Tenant isolation",
    body: "Every workflow, document, and adapter credential is scoped to a portfolio_company_id. Row-level security in Postgres enforces the boundary even on raw SQL.",
  },
  {
    icon: ShieldCheck,
    title: "Approval thresholds",
    body: "Configurable rules — spend, risk level, agent confidence — escalate to higher tiers automatically and require multiple approvers for sensitive bands.",
  },
  {
    icon: FileLock2,
    title: "Sensitive action gating",
    body: "Tool adapters declare their blast radius; high-impact calls (wire transfer, contract sign, PII export) require an approval token issued only after a human decision.",
  },
  {
    icon: KeyRound,
    title: "Credential isolation",
    body: "Adapter credentials live in a secrets manager (Replit Secrets, Vault, AWS Secrets Manager) and are injected per-call. The agent runtime never sees raw API keys.",
  },
];

function Security() {
  return (
    <section className="space-y-5">
      <Eyebrow>Security model</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        Built for procurement, legal, and risk review.
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECURITY.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.18, delay: i * 0.05, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <Card className="p-5 bg-card border-card-border h-full">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ----- Python-layer hardening ----- */

const HARDENING_ITEMS = [
  {
    icon: Database,
    title: "Isolated schema · Alembic migrations",
    body: "All Python-owned tables live in a dedicated agentops_py Postgres schema — fully isolated from the TypeScript/Drizzle-managed public schema. Schema changes are applied via a versioned Alembic migration chain (head c7f3a2b1d4e5), with explicit down_revision links and a startup guard that blocks the worker from booting against an unrecognised schema version.",
  },
  {
    icon: RefreshCw,
    title: "Durable job processing · row-lock concurrency",
    body: "The async worker claims jobs with SELECT FOR UPDATE SKIP LOCKED, making it safe to run multiple worker replicas against the same queue without double-processing. Failed jobs retry with capped exponential backoff; a max-retry ceiling moves exhausted jobs to a dead-letter state rather than looping indefinitely. Tested under real concurrent access with parallel worker processes hitting the same queue simultaneously.",
  },
  {
    icon: Brain,
    title: "RAG-backed assessment · confidence gating",
    body: "Every assessment retrieves live context via the shared vector search before calling the LLM. The model returns a structured verdict with an explicit confidence score. Results that clear the confidence threshold auto-complete; results below it are routed directly into the human approval gate rather than auto-completing — the same approval flow used by the TypeScript orchestrator.",
  },
  {
    icon: Activity,
    title: "Observability · security hardening",
    body: "Structured JSON log lines (timestamp, service, level, logger, msg, plus per-event fields) are emitted by every Python service. A self-hosted error-event log captures unhandled exceptions without requiring an external monitoring service. Every endpoint enforces tenant isolation. Rate limiting and standard security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, no-store Cache-Control) are applied globally via middleware. A clean dependency audit with no unresolved CVEs.",
  },
];

function PythonHardening() {
  return (
    <section className="space-y-6">
      <Eyebrow>Python-layer hardening</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight">
        Production-grade Python services running alongside the TypeScript edge.
      </h2>
      <p className="text-muted-foreground max-w-3xl leading-relaxed">
        The FastAPI worker layer ships with the infrastructure patterns that make
        it safe to operate at scale: isolated schema ownership, concurrent-safe
        job processing, confidence-gated LLM assessment, and hardened
        observability across every service.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {HARDENING_ITEMS.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.18, delay: i * 0.05, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <Card className="p-5 bg-card border-card-border h-full">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Voice bridge */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-chart-2/15 text-chart-2 flex items-center justify-center shrink-0">
            <Phone className="size-5" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight">
            Real-time voice bridge — end-to-end call tested, AI live
          </h3>
        </div>

        <Card className="p-6 bg-gradient-to-br from-chart-2/8 via-card to-primary/8 border-chart-2/25">
          <div className="flex items-start gap-3 mb-5">
            <div className="mt-0.5 inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md bg-chart-2/20 px-2 text-[11px] font-semibold uppercase tracking-wider text-chart-2">
              Live · call tested · AI responding
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            Inbound calls to the platform's Twilio number connect to a FastAPI
            WebSocket bridge that streams bidirectional audio directly to
            OpenAI's Realtime API (<Code>gpt-4o-realtime-preview</Code>).
            The bridge uses g.711 μ-law encoding — the native format Twilio
            Media Streams delivers — so no transcoding step is needed. Server-side
            VAD handles turn detection and interruption; the AI responds in
            real time, mid-sentence interruptions included.
            End-to-end tested: a live inbound call reached the AI and received
            a real spoken response.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <Card className="p-4 bg-background/40 border-card-border">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="size-4 text-chart-2" />
                <span className="text-xs font-semibold">Signal path</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-snug">
                PSTN → Twilio → TwiML webhook → <Code>/voice/incoming</Code> →
                Media Stream → <Code>/voice/ws</Code> → OpenAI Realtime API
              </p>
            </Card>
            <Card className="p-4 bg-background/40 border-card-border">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="size-4 text-chart-2" />
                <span className="text-xs font-semibold">Routing fix</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-snug">
                The Express proxy is ordered before body-parser middleware so
                the raw stream reaches FastAPI intact. WebSocket upgrades are
                tunnelled via <Code>server.on('upgrade')</Code> — HTTP proxy
                alone cannot negotiate a 101 handshake.
              </p>
            </Card>
            <Card className="p-4 bg-background/40 border-card-border">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="size-4 text-chart-2" />
                <span className="text-xs font-semibold">Latency telemetry</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-snug">
                Per-call audit log records <Code>call_started</Code>,{" "}
                <Code>first_response_ms</Code>, and <Code>call_ended</Code>
                events. Call state and event stream are persisted to{" "}
                <Code>voice_calls</Code> and <Code>voice_call_events</Code>{" "}
                in the <Code>agentops_py</Code> schema.
              </p>
            </Card>
          </div>

          <Card className="p-4 bg-card/60 border-card-border overflow-x-auto">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
              Call flow
            </div>
            <div className="min-w-[640px] flex items-stretch gap-2">
              <FlowStep n="1" label="Inbound call" sub="PSTN → Twilio" />
              <FlowConnector />
              <FlowStep n="2" label="TwiML webhook" sub="POST /voice/incoming → 200 XML" highlight />
              <FlowConnector />
              <FlowStep n="3" label="Media Stream WS" sub="wss:// → /voice/ws" />
              <FlowConnector />
              <FlowStep n="4" label="OpenAI Realtime" sub="gpt-4o-realtime-preview · VAD" />
            </div>
          </Card>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-muted-foreground">
          <Bullet>
            <Code>gpt-4o-realtime-preview</Code> model · server VAD · g.711 μ-law
          </Bullet>
          <Bullet>
            TwiML endpoint confirmed reachable externally — HTTP 200, 111ms response time
          </Bullet>
          <Bullet>
            <Code>voice_calls</Code> + <Code>voice_call_events</Code> Alembic-managed tables
          </Bullet>
          <Bullet>
            WebSocket tunnel: raw TCP pipe via <Code>server.on('upgrade')</Code> → port 8008
          </Bullet>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="pt-6 border-t border-border text-xs text-muted-foreground">
      AgentOps Command Center · Technical architecture · Demo orchestration in
      TypeScript; production-ready extension path in Python / LangGraph.
    </footer>
  );
}

/* --------------------------- Primitives ----------------------------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-medium">
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono">
      {children}
    </code>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function DiagramNode({
  icon: Icon,
  title,
  sub,
  tone = "primary",
  fullHeight = false,
}: {
  icon: typeof Workflow;
  title: string;
  sub: string;
  tone?: "primary" | "accent" | "muted";
  fullHeight?: boolean;
}) {
  const toneCls =
    tone === "accent"
      ? "border-chart-2/40 bg-chart-2/5"
      : tone === "muted"
        ? "border-card-border bg-background/40"
        : "border-primary/30 bg-primary/5";
  const iconTone =
    tone === "accent"
      ? "bg-chart-2/15 text-chart-2"
      : tone === "muted"
        ? "bg-muted text-muted-foreground"
        : "bg-primary/15 text-primary";
  return (
    <div
      className={cn(
        "flex-1 rounded-xl border p-4",
        toneCls,
        fullHeight && "h-full",
      )}
    >
      <div
        className={cn(
          "size-9 rounded-md flex items-center justify-center mb-3",
          iconTone,
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function DiagramArrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 min-w-[80px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <ArrowRight className="size-5 text-muted-foreground" />
    </div>
  );
}

function Chevron({ compact = false }: { compact?: boolean }) {
  return (
    <ArrowRight
      className={cn(
        "text-muted-foreground",
        compact ? "size-3.5" : "size-5",
      )}
    />
  );
}

function FlowStep({
  n,
  label,
  sub,
  highlight = false,
}: {
  n: string;
  label: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-lg border p-3",
        highlight
          ? "border-primary/40 bg-primary/5"
          : "border-card-border bg-background/40",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums mb-1">
        Step {n}
      </div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="flex items-center px-1">
      <ArrowRight className="size-4 text-muted-foreground" />
    </div>
  );
}

function Pill({
  icon: Icon,
  children,
}: {
  icon: typeof Workflow;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-background/40 px-3 py-1 text-xs">
      <Icon className="size-3.5 text-primary" />
      {children}
    </span>
  );
}
