import { randomUUID, randomBytes } from "node:crypto";
import type {
  ProofRun,
  ProofReceipt,
  ProofPublicRun,
  ProofShare,
  ProofEvaluation,
} from "@workspace/api-zod";
import { hashProof } from "./proof-assessment";

export interface SqlClient {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}
export interface SqlPool extends SqlClient {
  connect(): Promise<SqlClient & { release(): void }>;
}
export class ProofError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Additive, idempotent migration. Also represented in the shared Drizzle schema.
export const proofMigration = `
CREATE TABLE IF NOT EXISTS proof_runs (id text PRIMARY KEY, owner_hash text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS proof_runs_owner_idx ON proof_runs(owner_hash);
CREATE TABLE IF NOT EXISTS proof_receipts (run_id text PRIMARY KEY REFERENCES proof_runs(id), snapshot jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS proof_shares (id text PRIMARY KEY, run_id text NOT NULL REFERENCES proof_runs(id), token_hash text NOT NULL UNIQUE, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS proof_evaluations (id text PRIMARY KEY, owner_hash text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS proof_evaluations_owner_idx ON proof_evaluations(owner_hash);
`;
export async function migrateProof(pool: SqlClient) {
  await pool.query(proofMigration);
}

export function publicProof(run: ProofRun): ProofPublicRun {
  return {
    ...run,
    input: {
      ...run.input,
      documents: run.input.documents.map((d) => ({ name: d.name })),
    },
  };
}
export class ProofStore {
  constructor(private pool: SqlPool) {}
  async saveEvaluation(owner: string, report: ProofEvaluation) {
    await this.pool.query(
      "INSERT INTO proof_evaluations (id,owner_hash,snapshot) VALUES ($1,$2,$3)",
      [report.id, hashProof(owner), JSON.stringify(report)],
    );
    return report;
  }
  async evaluations(owner: string): Promise<ProofEvaluation[]> {
    const { rows } = await this.pool.query(
      "SELECT snapshot FROM proof_evaluations WHERE owner_hash=$1 ORDER BY created_at DESC LIMIT 20",
      [hashProof(owner)],
    );
    return rows.map((r) => r.snapshot);
  }
  async create(owner: string, run: ProofRun) {
    await this.pool.query(
      "INSERT INTO proof_runs (id, owner_hash, snapshot) VALUES ($1,$2,$3)",
      [run.id, hashProof(owner), JSON.stringify(run)],
    );
    return run;
  }
  async get(owner: string, id: string): Promise<ProofRun> {
    const { rows } = await this.pool.query(
      "SELECT snapshot FROM proof_runs WHERE id=$1 AND owner_hash=$2",
      [id, hashProof(owner)],
    );
    if (!rows[0])
      throw new ProofError(404, "Run not found in this browser workspace.");
    return rows[0].snapshot;
  }
  async list(owner: string): Promise<ProofRun[]> {
    const { rows } = await this.pool.query(
      "SELECT snapshot FROM proof_runs WHERE owner_hash=$1 ORDER BY created_at DESC LIMIT 50",
      [hashProof(owner)],
    );
    return rows.map((r) => r.snapshot);
  }
  async mutate(
    id: string,
    owner: string | null,
    apply: (run: ProofRun, client: SqlClient) => Promise<void> | void,
  ): Promise<ProofRun> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT snapshot, owner_hash FROM proof_runs WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (
        !rows[0] ||
        (owner !== null && rows[0].owner_hash !== hashProof(owner))
      )
        throw new ProofError(404, "Run not found in this browser workspace.");
      const run: ProofRun = rows[0].snapshot;
      await apply(run, client);
      run.updatedAt = new Date().toISOString();
      await client.query("UPDATE proof_runs SET snapshot=$2 WHERE id=$1", [
        id,
        JSON.stringify(run),
      ]);
      await client.query("COMMIT");
      return run;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async receive(id: string, fingerprint: string): Promise<ProofReceipt> {
    let receipt!: ProofReceipt;
    await this.mutate(id, null, async (run, client) => {
      if (
        run.analysis.fingerprint !== fingerprint ||
        run.review?.decision !== "approve" ||
        run.analysis.blockers.length ||
        !["delivering", "completed", "delivery-failed"].includes(run.status)
      )
        throw new ProofError(409, "No matching approved packet.");
      const { rows } = await client.query(
        "SELECT snapshot FROM proof_receipts WHERE run_id=$1",
        [id],
      );
      receipt = rows[0]?.snapshot;
      if (receipt) return;
      receipt = {
        id: `SBX-${randomUUID()}`,
        runId: id,
        fingerprint,
        acceptedAt: new Date().toISOString(),
        destination: "AgentOps sandbox ledger",
        externalDelivery: false,
        packet: run.analysis.fields,
      };
      await client.query(
        "INSERT INTO proof_receipts (run_id,snapshot) VALUES ($1,$2)",
        [id, JSON.stringify(receipt)],
      );
    });
    return receipt;
  }
  async receipt(id: string): Promise<ProofReceipt> {
    const { rows } = await this.pool.query(
      "SELECT snapshot FROM proof_receipts WHERE run_id=$1",
      [id],
    );
    if (!rows[0]) throw new ProofError(404, "Receipt not found.");
    return rows[0].snapshot;
  }
  async share(owner: string, id: string) {
    const run = await this.get(owner, id);
    if (!["completed", "rejected", "blocked"].includes(run.status))
      throw new ProofError(
        409,
        "Finish or resolve the run before sharing evidence.",
      );
    const token = randomBytes(32).toString("hex"),
      shareId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
    await this.pool.query(
      "INSERT INTO proof_shares (id,run_id,token_hash,snapshot,expires_at) VALUES ($1,$2,$3,$4,$5)",
      [
        shareId,
        id,
        hashProof(token),
        JSON.stringify(publicProof(run)),
        expiresAt,
      ],
    );
    return { id: shareId, token, expiresAt };
  }
  async shares(owner: string, id: string): Promise<ProofShare[]> {
    await this.get(owner, id);
    const { rows } = await this.pool.query(
      'SELECT id, created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt" FROM proof_shares WHERE run_id=$1 ORDER BY created_at DESC',
      [id],
    );
    return rows;
  }
  async revoke(owner: string, id: string, shareId: string) {
    await this.get(owner, id);
    await this.pool.query(
      "UPDATE proof_shares SET revoked_at=now() WHERE id=$1 AND run_id=$2 AND revoked_at IS NULL",
      [shareId, id],
    );
  }
  async shared(token: string): Promise<ProofPublicRun> {
    const { rows } = await this.pool.query(
      "SELECT snapshot FROM proof_shares WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
      [hashProof(token)],
    );
    if (!rows[0])
      throw new ProofError(
        404,
        "This proof link is unavailable, expired or revoked.",
      );
    return rows[0].snapshot;
  }
}
