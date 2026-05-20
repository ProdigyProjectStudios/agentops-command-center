import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type FixtureRow = {
  state: "submitted" | "running" | "approval_pending" | "finalized" | "failed";
  workflow_id: number;
  approval_id: number | null;
  request_title: string;
};

export type FixtureMap = Record<FixtureRow["state"], FixtureRow>;

export type ApprovalFixtureRow = {
  state: "pending" | "approved" | "rejected" | "revision_requested";
  workflow_id: number;
  approval_id: number;
  request_title: string;
  summary: string;
};

export type ApprovalFixtureMap = Record<
  ApprovalFixtureRow["state"],
  ApprovalFixtureRow
>;

const SEED_PATH = resolve(__dirname, "../fixtures/seed-workflow-detail.sql");
const APPROVALS_SEED_PATH = resolve(
  __dirname,
  "../fixtures/seed-approvals-queue.sql",
);
const DASHBOARD_SEED_PATH = resolve(
  __dirname,
  "../fixtures/seed-dashboard.sql",
);

export type DashboardMetricKey =
  | "activeWorkflows"
  | "pendingApprovals"
  | "agentActionsToday"
  | "complianceRisksFlagged"
  | "estimatedCostImpactCents";

// Mirrors the contributions in fixtures/seed-dashboard.sql. Keep these in
// lockstep with the seed: the spec computes
// expected_value = baseline + delta and asserts exactly.
export const DASHBOARD_DELTAS: Record<DashboardMetricKey, number> = {
  activeWorkflows: 2,
  pendingApprovals: 1,
  agentActionsToday: 3,
  complianceRisksFlagged: 1,
  estimatedCostImpactCents: 950000,
};

export type DashboardFixtures = {
  baseline: Record<DashboardMetricKey, number>;
  deltas: Record<DashboardMetricKey, number>;
  workflowIds: number[];
  workflowTitles: string[];
  activityIds: number[];
  activityMessages: string[];
  prefix: string;
};

export async function seedFixtures(): Promise<FixtureMap> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set to run the workflow-detail e2e tests.",
    );
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const sql = readFileSync(SEED_PATH, "utf8");
    await client.query(sql);
    const { rows } = await client.query<FixtureRow>(`
      SELECT state, workflow_id, approval_id, request_title
      FROM _e2e_workflow_fixtures
    `);
    const map: Partial<FixtureMap> = {};
    for (const row of rows) {
      map[row.state] = row;
    }
    const required: FixtureRow["state"][] = [
      "submitted",
      "running",
      "approval_pending",
      "finalized",
      "failed",
    ];
    for (const s of required) {
      if (!map[s]) {
        throw new Error(`Fixture seed did not produce a workflow for state '${s}'.`);
      }
    }
    return map as FixtureMap;
  } finally {
    await client.end();
  }
}

export async function seedApprovalsFixtures(): Promise<ApprovalFixtureMap> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set to run the approvals queue e2e tests.",
    );
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const sql = readFileSync(APPROVALS_SEED_PATH, "utf8");
    await client.query(sql);
    const { rows } = await client.query<ApprovalFixtureRow>(`
      SELECT state, workflow_id, approval_id, request_title, summary
      FROM _e2e_approvals_fixtures
    `);
    const map: Partial<ApprovalFixtureMap> = {};
    for (const row of rows) {
      map[row.state] = row;
    }
    const required: ApprovalFixtureRow["state"][] = [
      "pending",
      "approved",
      "rejected",
      "revision_requested",
    ];
    for (const s of required) {
      if (!map[s]) {
        throw new Error(
          `Approvals fixture seed did not produce a row for state '${s}'.`,
        );
      }
    }
    return map as ApprovalFixtureMap;
  } finally {
    await client.end();
  }
}

export async function seedDashboardFixtures(): Promise<DashboardFixtures> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set to run the dashboard e2e tests.",
    );
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const sql = readFileSync(DASHBOARD_SEED_PATH, "utf8");
    await client.query(sql);
    const { rows } = await client.query<{
      key: string;
      num_value: string | null;
      text_value: string | null;
    }>(`
      SELECT key, num_value, text_value FROM _e2e_dashboard_fixtures
    `);

    const byKey = new Map(rows.map((r) => [r.key, r]));
    const num = (key: string): number => {
      const row = byKey.get(key);
      if (!row || row.num_value === null) {
        throw new Error(`Dashboard fixture row missing numeric value: ${key}`);
      }
      return Number(row.num_value);
    };
    const text = (key: string): string => {
      const row = byKey.get(key);
      if (!row || row.text_value === null) {
        throw new Error(`Dashboard fixture row missing text value: ${key}`);
      }
      return row.text_value;
    };

    return {
      baseline: {
        activeWorkflows: num("baseline_active_workflows"),
        pendingApprovals: num("baseline_pending_approvals"),
        agentActionsToday: num("baseline_agent_actions_today"),
        complianceRisksFlagged: num("baseline_compliance_risks"),
        estimatedCostImpactCents: num("baseline_cost_impact_cents"),
      },
      deltas: { ...DASHBOARD_DELTAS },
      workflowIds: [
        num("seeded_workflow_1"),
        num("seeded_workflow_2"),
        num("seeded_workflow_3"),
      ],
      workflowTitles: [
        text("seeded_workflow_1"),
        text("seeded_workflow_2"),
        text("seeded_workflow_3"),
      ],
      activityIds: [
        num("seeded_activity_1"),
        num("seeded_activity_2"),
        num("seeded_activity_3"),
      ],
      activityMessages: [
        text("seeded_activity_1"),
        text("seeded_activity_2"),
        text("seeded_activity_3"),
      ],
      prefix: text("prefix"),
    };
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  const fixtures = await seedFixtures();
  process.env.E2E_FIXTURES = JSON.stringify(fixtures);
  const approvals = await seedApprovalsFixtures();
  process.env.E2E_APPROVAL_FIXTURES = JSON.stringify(approvals);
  // Note: the dashboard fixture is intentionally NOT seeded here. Its
  // baseline+delta assertions depend on the DB state at the moment the
  // dashboard spec runs, and other specs mutate that shared state (e.g.
  // approvals.spec.ts flips a pending approval to approved). The dashboard
  // spec reseeds inside its own beforeAll to capture an accurate baseline.
}
