import { sql } from "drizzle-orm";
import {
  activityLogsTable,
  agentStepsTable,
  agentsTable,
  approvalRequestsTable,
  db,
  knowledgeDocumentsTable,
  memoryChunksTable,
  operationalRequestsTable,
  pool,
  portfolioCompaniesTable,
  toolCallsTable,
  usersTable,
  workflowRunsTable,
} from "@workspace/db";
import { logger } from "./lib/logger";
import { engine } from "./orchestration/engine";

async function reset() {
  logger.info("Truncating all tables");
  await db.execute(sql`
    TRUNCATE TABLE
      activity_logs,
      tool_calls,
      agent_steps,
      approval_requests,
      workflow_runs,
      operational_requests,
      memory_chunks,
      knowledge_documents,
      agents,
      users,
      portfolio_companies,
      system_settings
    RESTART IDENTITY CASCADE
  `);
}

async function seedCompanies() {
  return db
    .insert(portfolioCompaniesTable)
    .values([
      {
        name: "Acme Industrial Co.",
        slug: "acme-industrial",
        industry: "Manufacturing",
        description:
          "Mid-market industrial parts manufacturer headquartered in Cleveland, OH.",
      },
      {
        name: "Northwind Logistics",
        slug: "northwind-logistics",
        industry: "Logistics",
        description:
          "Regional freight & last-mile delivery network across the Pacific Northwest.",
      },
      {
        name: "Lumen Health Group",
        slug: "lumen-health",
        industry: "Healthcare",
        description:
          "Outpatient specialty clinic chain with 14 locations in the Sun Belt.",
      },
    ])
    .returning();
}

async function seedUsers() {
  return db
    .insert(usersTable)
    .values([
      { name: "Riley Cooper", email: "riley@portco-ops.com", role: "operator" },
      { name: "Jordan Park", email: "jordan@portco-ops.com", role: "analyst" },
      { name: "Sasha Patel", email: "sasha@portco-ops.com", role: "partner" },
    ])
    .returning();
}

async function seedAgents() {
  return db
    .insert(agentsTable)
    .values([
      {
        slug: "ops-conductor",
        name: "Ops Conductor",
        role: "Lead orchestrator",
        description:
          "Triages incoming requests, routes to specialists, and synthesizes the final recommendation.",
        capabilities: [
          "Request classification",
          "Multi-agent routing",
          "Risk synthesis",
          "Recommendation generation",
        ],
        tools: ["request_classifier", "agent_router", "evidence_aggregator", "decision_synthesizer"],
        status: "active",
      },
      {
        slug: "legal-counsel",
        name: "Legal Counsel",
        role: "Compliance & contracts",
        description:
          "Runs jurisdictional compliance, vendor screens, and contract clause analysis.",
        capabilities: [
          "Compliance checks",
          "Contract clause analysis",
          "OFAC / sanctions screening",
          "License verification",
        ],
        tools: ["compliance_checker", "contract_analyzer", "ofac_screen"],
        status: "active",
      },
      {
        slug: "finance-analyst",
        name: "Finance Analyst",
        role: "Budget & forecasting",
        description:
          "Validates budget impact, forecasts ROI, and models cashflow exposure.",
        capabilities: [
          "Budget validation",
          "Forecast modeling",
          "ROI calculation",
          "Cashflow analysis",
        ],
        tools: ["budget_query", "forecast_model", "roi_calculator"],
        status: "active",
      },
      {
        slug: "communications",
        name: "Communications Lead",
        role: "Internal & external messaging",
        description:
          "Drafts polished memos, announcements, and stakeholder updates with the right tone.",
        capabilities: [
          "Memo drafting",
          "Audience tone calibration",
          "Distribution planning",
        ],
        tools: ["memo_generator", "tone_classifier"],
        status: "active",
      },
      {
        slug: "memory-keeper",
        name: "Memory Keeper",
        role: "Knowledge & policy retrieval",
        description:
          "Grounds agent reasoning in the firm's policy library, prior decisions, and playbooks.",
        capabilities: [
          "Semantic search",
          "Policy lookup",
          "Prior-decision recall",
        ],
        tools: ["semantic_search", "policy_index"],
        status: "active",
      },
    ])
    .returning();
}

async function seedKnowledge() {
  const docs = await db
    .insert(knowledgeDocumentsTable)
    .values([
      {
        title: "Vendor Onboarding Policy v3.2",
        category: "Procurement",
        summary:
          "Mandatory checks, documentation, and approval thresholds for new vendor engagements.",
        content:
          "All new vendor engagements above $25,000 require a current Certificate of Insurance, W-9, sanctions screen, and signed MSA. Engagements above $100,000 additionally require Partner sign-off and a 30-day cancellation right.",
      },
      {
        title: "Portfolio Operating Standards",
        category: "Governance",
        summary:
          "Cross-portfolio operating standards covering budget governance, communications, and reporting.",
        content:
          "Department heads own quarterly budget envelopes. Spend approaching 85% utilization requires escalation. All material vendor decisions are logged in AgentOps with full agent reasoning trail.",
      },
      {
        title: "Facilities Workflow Playbook",
        category: "Playbook",
        summary:
          "Step-by-step playbook for facilities and capital improvement requests.",
        content:
          "Facilities requests follow: scope → contractor shortlist (≥3 bids unless emergency) → COI verification → finance approval → kickoff. Tenant-facing notices require 48 hours advance distribution.",
      },
      {
        title: "Communications Tone Guide",
        category: "Brand",
        summary:
          "Voice and tone guidance for internal memos and external announcements.",
        content:
          "Internal memos: confident, concise, decision-forward. External announcements: measured, factual, no speculation. Always disclose AgentOps as the orchestration layer when sharing decision provenance.",
      },
    ])
    .returning();

  for (const doc of docs) {
    const chunks = doc.content.match(/.{1,140}/g) ?? [];
    for (const chunk of chunks) {
      await db.insert(memoryChunksTable).values({
        documentId: doc.id,
        content: chunk,
        tokens: Math.ceil(chunk.length / 4),
      });
    }
  }
  return docs;
}

async function seedRequestAndRun(
  companyId: number,
  title: string,
  description: string,
  department: string,
  priority: "low" | "medium" | "high" | "urgent",
  requestedBy: string,
  finalize?: "approved" | "rejected" | "revision_requested",
) {
  const [request] = await db
    .insert(operationalRequestsTable)
    .values({
      portfolioCompanyId: companyId,
      title,
      description,
      department,
      priority,
      requestedBy,
    })
    .returning();
  if (!request) throw new Error("Failed to create seed request");
  const [run] = await db
    .insert(workflowRunsTable)
    .values({
      requestId: request.id,
      status: "submitted",
      currentStage: "submitted",
    })
    .returning();
  if (!run) throw new Error("Failed to create seed workflow run");

  await engine.run(run.id);

  if (finalize) {
    const approvalRows = await db
      .select()
      .from(approvalRequestsTable);
    const approval = approvalRows.find((a) => a.workflowRunId === run.id);
    if (approval) {
      const newApprovalStatus =
        finalize === "revision_requested" ? "revision_requested" : finalize;
      const newWorkflowStatus =
        finalize === "approved"
          ? ("approved" as const)
          : finalize === "rejected"
            ? ("rejected" as const)
            : ("submitted" as const);
      await db
        .update(approvalRequestsTable)
        .set({
          status: newApprovalStatus,
          decidedBy: "Sasha Patel",
          decisionNote:
            finalize === "approved"
              ? "Approved per playbook; proceed with kickoff."
              : finalize === "rejected"
                ? "Rejected — recommend reframing scope and resubmitting."
                : "Need additional vendor bids before approving.",
          decidedAt: new Date(),
        })
        .where(sql`id = ${approval.id}`);
      await db
        .update(workflowRunsTable)
        .set({ status: newWorkflowStatus, currentStage: newWorkflowStatus })
        .where(sql`id = ${run.id}`);
      await db.insert(activityLogsTable).values({
        workflowRunId: run.id,
        actor: "Sasha Patel",
        actorType: "user",
        action: finalize,
        message: `Operator ${finalize.replace("_", " ")} the workflow.`,
      });
      if (finalize === "approved" || finalize === "rejected") {
        await engine.finalize(run.id);
      }
    }
  }
  return { request, run };
}

async function main() {
  await reset();
  const companies = await seedCompanies();
  await seedUsers();
  await seedAgents();
  await seedKnowledge();

  if (!companies[0] || !companies[1] || !companies[2]) {
    throw new Error("Expected 3 seed companies");
  }

  // 1. Completed approved workflow — roofing contractor for Acme HQ
  await seedRequestAndRun(
    companies[0].id,
    "Approve $48K roofing contractor for Acme HQ",
    "Acme HQ has active roof leaks above the engineering floor. Apex Roofing LLC submitted the lowest of three bids at $48,000 with a 10-year workmanship warranty. Repairs required within 30 days to avoid further interior damage.",
    "Facilities",
    "high",
    "Riley Cooper",
    "approved",
  );

  // 2. Pending approval — marketing campaign at Northwind
  await seedRequestAndRun(
    companies[1].id,
    "Q3 driver-recruitment marketing campaign — $35K spend",
    "Northwind needs to fill 42 open driver roles before peak season. Proposed multi-channel campaign across Indeed, Meta, and regional radio at a $35,000 total spend with a 60-day window.",
    "Marketing",
    "medium",
    "Jordan Park",
  );

  // 3. Rejected workflow — risky M&A communications draft
  await seedRequestAndRun(
    companies[2].id,
    "Acquisition announcement for Lumen + Pinegrove merger",
    "Draft and authorize the public acquisition announcement for the proposed Lumen Health acquisition of Pinegrove Specialty Clinics. Deal not yet signed; legal asked us to gate.",
    "Strategy",
    "urgent",
    "Sasha Patel",
    "rejected",
  );

  // 4. Revision-requested workflow — needs more vendor bids
  await seedRequestAndRun(
    companies[0].id,
    "New ERP licensing renewal — $84K SaaS spend",
    "Three-year ERP renewal with NetSuite at $84,000/yr. Current contract auto-renews in 22 days. No alternative bids attached.",
    "IT",
    "high",
    "Riley Cooper",
    "revision_requested",
  );

  // 5. Fresh request, no run yet — operator can hit "Run pipeline"
  const [freshRequest] = await db
    .insert(operationalRequestsTable)
    .values({
      portfolioCompanyId: companies[1].id,
      title: "Hire two warehouse leads at Tacoma DC",
      description:
        "Backfill two warehouse-lead positions at the Tacoma distribution center; need offers out within two weeks to cover the holiday surge.",
      department: "People",
      priority: "high",
      requestedBy: "Jordan Park",
    })
    .returning();
  if (freshRequest) {
    await db.insert(workflowRunsTable).values({
      requestId: freshRequest.id,
      status: "submitted",
      currentStage: "submitted",
    });
  }

  // System-level activity log entry not tied to any workflow
  await db.insert(activityLogsTable).values({
    workflowRunId: null,
    actor: "system",
    actorType: "system",
    action: "platform_started",
    message: "AgentOps platform initialized with seed data.",
    metadata: { seedRunAt: new Date().toISOString() },
  });

  // Quick stats for the seed log
  const counts = {
    workflows: (await db.select().from(workflowRunsTable)).length,
    steps: (await db.select().from(agentStepsTable)).length,
    toolCalls: (await db.select().from(toolCallsTable)).length,
    activity: (await db.select().from(activityLogsTable)).length,
    approvals: (await db.select().from(approvalRequestsTable)).length,
  };
  logger.info(counts, "Seed completed");
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, "Seed failed");
    await pool.end().catch(() => {});
    process.exit(1);
  });
