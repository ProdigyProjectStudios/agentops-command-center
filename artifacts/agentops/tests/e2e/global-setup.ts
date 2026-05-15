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

export default async function globalSetup() {
  const fixtures = await seedFixtures();
  process.env.E2E_FIXTURES = JSON.stringify(fixtures);
  const approvals = await seedApprovalsFixtures();
  process.env.E2E_APPROVAL_FIXTURES = JSON.stringify(approvals);
}
