import { pool } from "@workspace/db";
/** All linked decisions go through the capability-owned, fingerprint-bound proof gate. */
export async function isProofWorkflow(workflowRunId: number) {
  const { rows } = await pool.query(
    "SELECT 1 FROM proof_graph_links WHERE workflow_run_id=$1",
    [workflowRunId],
  );
  return rows.length > 0;
}
