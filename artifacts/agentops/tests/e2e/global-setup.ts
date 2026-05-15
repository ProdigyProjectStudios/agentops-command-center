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

const SEED_PATH = resolve(__dirname, "../fixtures/seed-workflow-detail.sql");

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

export default async function globalSetup() {
  const fixtures = await seedFixtures();
  process.env.E2E_FIXTURES = JSON.stringify(fixtures);
}
