import { pool } from "@workspace/db";
import type { ProofGraphSnapshot, ProofRun } from "@workspace/api-zod";
import { engine } from "../orchestration/engine";
import { PIPELINE, FINALIZE_NODE } from "../orchestration/edges";
import { getLlmMode } from "./llm";
import { hashProof } from "./proof-assessment";
import { ProofError, type SqlClient } from "./proof-store";
import type { ProofGraphAdapter } from "./proof-graph";

const active = new Set<string>();
async function nodes(id: number) {
  const { rows } = await pool.query(
    `SELECT s.step_index AS index, s.name, a.slug AS agent, s.output
    FROM agent_steps s JOIN agents a ON a.id=s.agent_id
    WHERE s.workflow_run_id=$1 AND s.status='completed' ORDER BY s.step_index`,
    [id],
  );
  return rows as ProofGraphSnapshot["nodes"];
}
export const originalProofGraph: ProofGraphAdapter = {
  async withLock(id, work) {
    if (active.has(id))
      throw new ProofError(
        409,
        "This graph operation is already running. Refresh to check progress.",
      );
    // Each active graph holds one session lock connection while its nodes query the pool.
    // Bound concurrency so a burst cannot exhaust every pool slot with lock holders.
    if (active.size >= 3)
      throw new ProofError(
        429,
        "Three graph operations are already running. Try again after one finishes.",
      );
    active.add(id);
    const key = Buffer.from(hashProof(id), "hex").readInt32BE(0);
    let client: (SqlClient & { release(destroy?: boolean): void }) | undefined;
    let locked = false;
    try {
      client = await pool.connect();
      const { rows } = await client.query(
        "SELECT pg_try_advisory_lock(7131,$1) AS locked",
        [key],
      );
      locked = rows[0].locked;
      if (!locked)
        throw new ProofError(
          409,
          "This graph operation is already running on another worker.",
        );
      return await work();
    } finally {
      if (client) {
        // Never return a connection with an uncertain session lock to the pool.
        try {
          if (locked)
            await client.query("SELECT pg_advisory_unlock(7131,$1)", [key]);
          client.release();
        } catch {
          client.release(true);
        }
      }
      active.delete(id);
    }
  },
  async prepare(run, client) {
    const required = [...new Set(PIPELINE.map((n) => n.agentSlug))];
    const agents = await client.query(
      "SELECT slug FROM agents WHERE slug=ANY($1::text[])",
      [required],
    );
    if (agents.rows.length !== required.length)
      throw new ProofError(
        503,
        "The original graph agents must be seeded before running this workflow.",
      );
    const company =
      await client.query(`INSERT INTO portfolio_companies (slug,name,industry,description)
      VALUES ('proof-lab-synthetic','Proof Lab — synthetic data','Synthetic demonstration','Synthetic evidence workflows only')
      ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`);
    const description = `${run.input.workflow}\n${run.input.documents.map((d) => `${d.name}\n${d.text}`).join("\n\n")}\n\nProof run: ${run.id}\nInput fingerprint: ${run.analysis.fingerprint}\nFrozen rule findings and policy evidence (authoritative for the packet):\n${JSON.stringify(run.analysis)}`;
    const request = await client.query(
      `INSERT INTO operational_requests
      (portfolio_company_id,title,description,department,priority,requested_by)
      VALUES ($1,$2,$3,'Proof Lab','medium','browser operator — synthetic') RETURNING id`,
      [company.rows[0].id, run.input.title, description],
    );
    const workflow = await client.query(
      "INSERT INTO workflow_runs (request_id) VALUES ($1) RETURNING id",
      [request.rows[0].id],
    );
    const id = workflow.rows[0].id as number;
    await client.query(
      "INSERT INTO proof_graph_links (run_id,workflow_run_id) VALUES ($1,$2)",
      [run.id, id],
    );
    return id;
  },
  async execute(id, mode) {
    if (mode === "live-ai" && getLlmMode() !== "live")
      throw new ProofError(503, "Live graph credentials are not configured.");
    await engine.run(id, mode);
    const saved = await nodes(id);
    if (
      saved.length !== PIPELINE.length ||
      saved.some((n, i) => n.name !== PIPELINE[i]?.stepName)
    )
      throw new Error(
        "The original graph did not complete every required node.",
      );
    const { rows: workflows } = await pool.query(
      "SELECT status,summary FROM workflow_runs WHERE id=$1",
      [id],
    );
    if (workflows[0]?.status !== "approval_pending")
      throw new Error("The graph did not reach human review.");
    const { rows: tools } = await pool.query(
      `SELECT tool_name AS name,status,output,output_summary AS summary,duration_ms AS "durationMs"
      FROM tool_calls WHERE workflow_run_id=$1 ORDER BY id`,
      [id],
    );
    return { nodes: saved, tools, summary: workflows[0].summary ?? "" };
  },
  async finalize(run: ProofRun) {
    const graph = run.graph!;
    const expected =
      run.review!.decision === "approve" ? "approved" : "rejected";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT status FROM workflow_runs WHERE id=$1 FOR UPDATE",
        [graph.workflowRunId],
      );
      if (
        !rows[0] ||
        ![
          "approval_pending",
          expected,
          ...(expected === "approved" ? ["finalized"] : []),
        ].includes(rows[0].status)
      )
        throw new Error("Graph decision conflicts with saved human review.");
      if (rows[0].status === "approval_pending") {
        await client.query(
          `UPDATE approval_requests SET status=$2,decided_by='Proof Lab browser operator',decision_note=$3,decided_at=$4 WHERE workflow_run_id=$1`,
          [graph.workflowRunId, expected, run.review!.note, run.review!.at],
        );
        await client.query(
          "UPDATE workflow_runs SET status=$2::workflow_status,current_stage=$2::text WHERE id=$1",
          [graph.workflowRunId, expected],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    await engine.finalize(graph.workflowRunId);
    const final = (await nodes(graph.workflowRunId)).find(
      (n) => n.name === FINALIZE_NODE.stepName,
    );
    if (!final) throw new Error("Graph finalization was not recorded.");
    return { state: "completed", at: new Date().toISOString(), node: final };
  },
};
