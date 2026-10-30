import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import express from "express";
import {
  proofTemplates,
  proofPackHtml,
  type ProofRun,
} from "@workspace/api-zod";

// Real original nodes, engine, database and HTTP receiver. Only provider transport is mocked.
process.env.OPENAI_API_KEY = "graph-test-only";
delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
process.env.LIVE_INTER_STEP_DELAY_MS = "0";
const prompts: string[] = [];
let failNext = false;
let partialNext = false;
class FakeOpenAI {
  chat = {
    completions: {
      create: async (request: any) => {
        prompts.push(request.messages[1].content);
        if (failNext) {
          failNext = false;
          throw new Error("Synthetic provider failure");
        }
        const shape = JSON.parse(
          request.messages[0].content.split("EXAMPLE SHAPE:\n")[1],
        );
        const content = partialNext ? "{}" : JSON.stringify(shape);
        partialNext = false;
        return {
          choices: [{ message: { content } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 30,
            total_tokens: 130,
          },
        };
      },
    },
  };
}
mock.module("openai", { defaultExport: FakeOpenAI });
const { pool } = await import("@workspace/db");
const { ProofStore, migrateProof } = await import("../lib/proof-store");
const { ProofService, httpProofDelivery } =
  await import("../lib/proof-service");
const { originalProofGraph } = await import("../lib/proof-graph-runtime");
const { proofRunsRouter } = await import("../routes/proof-runs");
const { default: workflows } = await import("../routes/workflows");
const { default: approvals } = await import("../routes/approvals");
const { PIPELINE } = await import("../orchestration/edges");
const owner = randomBytes(32).toString("hex"),
  stranger = randomBytes(32).toString("hex");
const operator = "graph-test-operator-key-000000000000000000";
const secret = "internal-graph-test";
let base = "";
const store = new ProofStore(pool);
let failFinalization = false;
const service = new ProofService(
  store,
  httpProofDelivery(() => `${base}/api/proof/sandbox`, secret),
  undefined,
  {
    ...originalProofGraph,
    async finalize(run) {
      const result = await originalProofGraph.finalize(run);
      if (failFinalization) {
        failFinalization = false;
        throw new Error("Response lost after graph finalization");
      }
      return result;
    },
  },
);
const app = express();
app.use(express.json());
app.use("/api", proofRunsRouter(service, secret, undefined, operator));
app.use("/api", workflows, approvals);
const server = app.listen(0, "127.0.0.1");
let knowledgeId: number;
const runIds: string[] = [];
before(async () => {
  await migrateProof(pool);
  for (const slug of new Set(PIPELINE.map((n) => n.agentSlug)))
    await pool.query(
      "INSERT INTO agents(slug,name,role) VALUES ($1,$1,'graph test') ON CONFLICT(slug) DO NOTHING",
      [slug],
    );
  const { rows } = await pool.query(
    "INSERT INTO knowledge_documents(title,category,summary,content) VALUES ('Synthetic vendor graph QA','QA','Synthetic vendor invoice proof','Synthetic vendor invoice source policy for integration tests only') RETURNING id",
  );
  knowledgeId = rows[0].id;
  if (!server.listening)
    await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  for (const id of runIds) {
    const { rows } = await pool.query(
      "SELECT w.id,w.request_id FROM proof_graph_links l JOIN workflow_runs w ON w.id=l.workflow_run_id WHERE l.run_id=$1",
      [id],
    );
    await pool.query("DELETE FROM proof_shares WHERE run_id=$1", [id]);
    await pool.query("DELETE FROM proof_receipts WHERE run_id=$1", [id]);
    await pool.query("DELETE FROM proof_graph_links WHERE run_id=$1", [id]);
    await pool.query("DELETE FROM proof_runs WHERE id=$1", [id]);
    if (rows[0])
      await pool.query("DELETE FROM operational_requests WHERE id=$1", [
        rows[0].request_id,
      ]);
  }
  if (knowledgeId)
    await pool.query("DELETE FROM knowledge_documents WHERE id=$1", [
      knowledgeId,
    ]);
  await pool.end();
});
async function api(
  path: string,
  body?: unknown,
  token = owner,
  key = operator,
) {
  return fetch(`${base}/api${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      "x-proof-owner": token,
      "x-proof-integration-key": key,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function create(recoveryDemo = false) {
  const run = await service.create(owner, {
    ...structuredClone(proofTemplates[0].input),
    connectedReview: true,
    recoveryDemo,
  });
  runIds.push(run.id);
  return run;
}
function review(run: ProofRun, decision: "approve" | "reject" = "approve") {
  return {
    decision,
    note: "Inspected source lines and every saved original graph node",
    fingerprint: run.analysis.fingerprint,
    graphFingerprint: run.graph?.fingerprint,
  };
}
async function stepIds(run: ProofRun) {
  return (
    await pool.query(
      "SELECT id FROM agent_steps WHERE workflow_run_id=$1 AND status='completed' ORDER BY step_index",
      [run.graph!.workflowRunId],
    )
  ).rows.map((r) => r.id);
}

test("original demo graph → fingerprint-bound approval → final node → HTTP receipt, export and share", async () => {
  let run = await create();
  const calls = prompts.length;
  const results = await Promise.all([
    api(`/proof/runs/${run.id}/graph`, { mode: "demo" }),
    api(`/proof/runs/${run.id}/graph`, { mode: "demo" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  run = await store.get(owner, run.id);
  assert.equal(run.graph?.state, "ready");
  assert.equal(
    prompts.length,
    calls,
    "demo must never use configured provider credentials",
  );
  assert.equal(run.graph.snapshot?.nodes.length, 7);
  assert.equal(
    run.graph.snapshot?.nodes.filter(
      (n) => (n.output.execution as any)?.kind === "demo",
    ).length,
    6,
  );
  const memory = run.graph.snapshot!.tools.find(
    (t) => t.name === "memory_search",
  )!;
  assert.ok(
    (memory.output as any).hits.some((h: any) => h.documentId === knowledgeId),
  );
  assert.ok(
    run.graph
      .snapshot!.tools.filter((t) => t.name !== "memory_search")
      .every((t) => (t.output as any).executionKind === "simulation"),
  );
  const linked = (
    await pool.query(
      "SELECT r.description FROM workflow_runs w JOIN operational_requests r ON r.id=w.request_id WHERE w.id=$1",
      [run.graph.workflowRunId],
    )
  ).rows[0];
  assert.ok(linked.description.includes(run.input.documents[0].text));
  const { rows: cards } = await pool.query(
    "SELECT id FROM approval_requests WHERE workflow_run_id=$1",
    [run.graph.workflowRunId],
  );
  for (const action of ["approve", "reject", "request-revision"])
    assert.equal(
      (await api(`/approvals/${cards[0].id}/${action}`, { note: "bypass" }))
        .status,
      409,
    );
  assert.equal(
    (await api(`/workflows/${run.graph.workflowRunId}/run`, {})).status,
    409,
  );
  assert.equal(
    (await api(`/proof/runs/${run.id}/graph`, { mode: "demo" }, stranger))
      .status,
    404,
  );
  assert.equal(
    (
      await api(`/proof/runs/${run.id}/review`, {
        ...review(run),
        graphFingerprint: undefined,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(`/proof/runs/${run.id}/review`, {
        ...review(run),
        graphFingerprint: "f".repeat(64),
      })
    ).status,
    409,
  );
  assert.equal((await store.get(owner, run.id)).review, null);
  const oldSteps = await stepIds(run);
  run = await service.runGraph(owner, run.id, "demo");
  assert.deepEqual(await stepIds(run), oldSteps);
  run = await service.review(owner, run.id, review(run));
  assert.equal(run.status, "completed");
  assert.equal(run.graph?.finalization?.state, "completed");
  assert.equal((await stepIds(run)).length, 8);
  assert.deepEqual(run.receipt?.graph, {
    workflowRunId: run.graph!.workflowRunId,
    fingerprint: run.graph!.fingerprint,
  });
  assert.equal((await store.receipt(run.id)).id, run.receipt?.id);
  assert.equal(
    ((await (await api(`/proof/runs/${run.id}/export`)).json()) as ProofRun)
      .graph?.fingerprint,
    run.graph!.fingerprint,
  );
  const share = await store.share(owner, run.id);
  const shared = await store.shared(share.token);
  assert.equal(shared.graph?.fingerprint, run.graph!.fingerprint);
  assert.match(proofPackHtml(run), /Original graph evidence/);
  assert.match(proofPackHtml(run), new RegExp(run.graph!.fingerprint!));
  assert.equal(
    (await new ProofStore(pool).get(owner, run.id)).receipt?.id,
    run.receipt?.id,
  );
});

test("live graph requires cost consent/key; provider failure and incomplete output block approval; same graph resumes", async () => {
  let run = await create();
  assert.equal(
    (await api(`/proof/runs/${run.id}/graph`, { mode: "live-ai" })).status,
    400,
  );
  assert.equal(
    (
      await api(
        `/proof/runs/${run.id}/graph`,
        { mode: "live-ai", liveCostAcknowledged: true },
        owner,
        "bad",
      )
    ).status,
    403,
  );
  partialNext = true;
  run = await service.runGraph(owner, run.id, "live-ai");
  assert.equal(run.graph?.state, "failed");
  assert.equal(
    (await api(`/proof/runs/${run.id}/review`, review(run))).status,
    409,
  );
  assert.equal(
    (await api(`/proof/runs/${run.id}/graph`, { mode: "demo" })).status,
    409,
  );
  const id = run.graph!.workflowRunId;
  const original = PIPELINE[3].run;
  PIPELINE[3].run = async (ctx) => {
    failNext = true;
    return original(ctx);
  };
  try {
    run = await service.runGraph(owner, run.id, "live-ai");
  } finally {
    PIPELINE[3].run = original;
  }
  assert.equal(run.graph?.state, "failed");
  const retained = await stepIds(run);
  assert.equal(retained.length, 3);
  const count = prompts.length;
  run = await service.runGraph(owner, run.id, "live-ai");
  assert.equal(run.graph?.state, "ready");
  assert.equal(run.graph?.workflowRunId, id);
  assert.equal(prompts.length - count, 3);
  assert.deepEqual((await stepIds(run)).slice(0, 3), retained);
  assert.equal(
    run.graph!.snapshot!.nodes.filter(
      (n) => (n.output.execution as any)?.kind === "live-ai",
    ).length,
    6,
  );
  assert.ok(prompts.at(-1)!.includes(run.input.documents[0].text));
  assert.ok(prompts.at(-1)!.includes('"legal_review"'));
  assert.ok(run.graph!.snapshot!.nodes.every((n) => !n.output.fallback));
  run = await service.review(owner, run.id, review(run));
  assert.equal(run.status, "completed");
});

test("lost graph-finalization response and lost receiver response recover without repeated nodes or receipts", async () => {
  let run = await create(true);
  run = await service.runGraph(owner, run.id, "demo");
  failFinalization = true;
  run = await service.review(owner, run.id, review(run));
  assert.equal(run.status, "delivery-failed");
  assert.equal(run.graph?.finalization?.state, "failed");
  await assert.rejects(() => store.receipt(run.id));
  assert.equal((await stepIds(run)).length, 8);
  run = await service.deliver(owner, run.id);
  assert.equal(run.status, "completed");
  assert.equal((await stepIds(run)).length, 8);
  let recovery = await create(true);
  recovery = await service.runGraph(owner, recovery.id, "demo");
  recovery = await service.review(owner, recovery.id, review(recovery));
  assert.equal(recovery.status, "delivery-failed");
  const receipt = await store.receipt(recovery.id);
  recovery = await service.deliver(owner, recovery.id);
  assert.equal(recovery.status, "completed");
  assert.equal(recovery.receipt?.id, receipt.id);
  assert.equal((await stepIds(recovery)).length, 8);
});

test("rejected graph finalization is retryable and idempotent, never dispatches", async () => {
  let run = await create();
  run = await service.runGraph(owner, run.id, "demo");
  failFinalization = true;
  run = await service.review(owner, run.id, review(run, "reject"));
  assert.equal(run.status, "rejected");
  assert.equal(run.graph?.finalization?.state, "failed");
  run = await service.finalizeGraph(owner, run.id);
  run = await service.finalizeGraph(owner, run.id);
  assert.equal(run.graph?.finalization?.state, "completed");
  assert.equal((await stepIds(run)).length, 8);
  await assert.rejects(() => service.deliver(owner, run.id));
  await assert.rejects(() => store.receipt(run.id));
});

test("unfinished or tampered graph cannot produce an approved receiver receipt", async () => {
  let run = await create();
  run = await service.runGraph(owner, run.id, "demo");
  await store.mutate(run.id, owner, (current) => {
    current.graph!.snapshot!.nodes[0].output.summary =
      "Changed after the operator viewed it";
  });
  await assert.rejects(
    () => service.review(owner, run.id, review(run)),
    /saved graph output/,
  );
  assert.equal((await store.get(owner, run.id)).review, null);
  await assert.rejects(() => store.receive(run.id, run.analysis.fingerprint));
});
