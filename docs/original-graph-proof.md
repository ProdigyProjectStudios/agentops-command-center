# Original graph → human approval → verified receipt

Proof Lab can now execute the original Node/TypeScript `WorkflowEngine` on a saved synthetic packet. This is separate from the optional three cited specialist reviews and the Python service. It runs the seven existing pre-approval nodes, records their outputs and tools, then runs the original finalization node after the operator decides.

## Operator flow

1. Evaluate synthetic documents in Proof Lab. Rule and policy blockers must be resolved first.
2. Before approving, select **Run original graph**. Demo mode makes no model calls even when server credentials exist. Live mode requires the integration operator key and explicit cost acknowledgement for six provider calls, plus any retries.
3. Inspect the seven saved node outputs, retrieved keyword results and tool labels. Live responses must satisfy each node's complete schema; provider errors or partial responses cannot become demo fallback proof. Live prompts receive the saved packet, frozen policy assessment, retrieved memory and upstream outputs.
4. Approve or reject with a review note. Both the input/policy fingerprint and the graph-output fingerprint are checked and saved with the decision. Legacy workflow/approval mutation routes reject linked runs.
5. Approval finalizes the original graph, then submits the exact rule-extracted packet over HTTP to the existing first-party sandbox. A separate GET verifies the receiver record, including its workflow ID and graph fingerprint. Finalization itself only prepares follow-up actions; it does not dispatch them.
6. Export JSON, download the printable pack or create an expiring read-only share. Graph outputs and retrieved snippets travel with that proof. These outputs can quote uploaded text: inspect before sharing. Original source files and workspace keys are not in public snapshots.

## Persistence, retry and concurrency

- Additive startup migration creates `proof_graph_links`. Creating the synthetic legacy request/workflow/link and saving the proof's graph reference is one PostgreSQL transaction.
- Original rows remain in `workflow_runs`, `agent_steps`, `tool_calls` and `approval_requests`. The proof snapshot freezes completed node/tool outputs. A proof run's graph mode is immutable; creating a new run is required to change it.
- A PostgreSQL session advisory lock and process-local guard prevent simultaneous graph operations for the same proof ID. At most three graph operations run per process, leaving the normal connection pool room for node queries.
- Interrupted execution can be resumed using the same workflow ID; the existing engine hydrates completed nodes. This is request-driven resume, not a durable background queue. Do not promise automatic recovery or exactly-once provider billing if a process dies during a provider call.
- Human approval remains unavailable while the graph is incomplete. Lost finalization responses retry the same decision and do not append a second final node. A rejected run can retry graph finalization without authorizing delivery.
- Delivery cannot proceed until graph finalization is confirmed. Receiver retries reuse the existing run ID and receipt; the graph fingerprint is checked independently alongside the extracted packet fields.
- Existing proof runs without a graph keep their existing approval/delivery behavior.

## Replit deployment

Deploy the existing application from this PR branch; preserve the production database and stored proof records. Do **not** run the destructive demo seed script against production. Normal startup runs `migrateProof` before accepting traffic. The five original agents must already exist (Ops, Memory, Legal, Finance, Communications); a missing seed produces a configuration error rather than a fabricated run.

Live mode uses the existing configured OpenAI/Replit provider and per-agent model settings. It additionally requires `PROOF_INTEGRATION_KEY` (at least 32 characters). Enter that key in the graph control when executing a live graph; it is not saved in browser storage. The GitHub token/repository are not required for graph execution. Never set `PROOF_PREVIEW_GRAPH` on production; it is an isolated QA-preview option only.

## Verification — 2026-10-30

- Native GitHub CI on commit `4eacbb2`: **150/150 API tests passed**, zero failures/skips, using PostgreSQL 16 with pgvector. All five new original-graph integration cases passed there. Node type checks/builds and Python syntax/dependency checks also passed ([CI run](https://github.com/ProdigyProjectStudios/agentops-command-center/actions/runs/40981136510)).
- The separate browser CI job initially stopped before tests: `ubuntu-latest` resolved to Ubuntu 26.04, unsupported by the installed Playwright version. Its runner is now pinned to Ubuntu 24.04; browser-suite completion is tracked in the PR checks.

- Local full API regression attempt: 150 tests, 146 passed; four node-boundary tests failed because the fresh local test database had not seeded the required agents. After correcting the fixture, all 13 tests in the four database-dependent suites passed. The unavailable-database guard correctly prevented false-positive fallback results. No skipped tests.
- Five new integration tests execute the actual original graph and production pg/Drizzle path against embedded PostgreSQL over TCP, with a real Express HTTP sender/receiver. Only the provider transport is mocked for live-mode scenarios. They cover demo execution despite configured credentials, six live calls, incomplete responses, provider failure and resume retaining completed nodes, cost/key gates, ownership, legacy approval/run bypasses, stale/missing/tampered fingerprints, finalization response loss, receiver response loss, rejection, JSON export and shared snapshots. All five passed; final focused rerun including proof-pack checks passed 7/7.
- Local embedded schema was generated from the current Drizzle schema. Its unused `vector(1536)` column was represented as text because this graph uses keyword retrieval; no vector-search behavior is claimed. The native pgvector PostgreSQL CI run above covers the actual database column type and driver path.
- Type checks across shared packages/API/frontend passed. Frontend and API production builds passed. Existing frontend large-chunk warning remains.
- Desktop browser preview: synthetic invoice → real seven-node demo graph → saved human approval → actual final node → independently verified HTTP receipt. Inspected the saved node payload, explicit demo/simulation labels and finalization. Read-only shared view preserved all seven nodes and the receipt's graph binding.
- Browser result: run `309acaa3-f42a-460b-b524-52b18f0a7cca`, receipt `SBX-0966c612-f6d2-459d-8b14-ae17dca272c8`. This is isolated preview evidence, not a production run.
- Restarting the managed preview recreated its temporary embedded database; the earlier preview run was consequently absent. This does **not** verify production restart durability. Existing proof-store database-close/reopen tests passed, but a production restart and graph resume check is still required after deployment.
- New graph live-provider execution, mobile layout, production restart, Python graph/voice and an external GitHub delivery were not verified in this increment. Earlier production QA verified the separate three-specialist live review path, not this new graph integration.

## Boundaries

Synthetic demo capability keys are not authenticated organization workspaces. Graph outputs are advisory; schema validity does not establish factual correctness. Demo node narratives/budget estimates are preset illustrations and may differ from extracted packet values. Only `memory_search` is a real original-graph tool invocation; the other tool records are simulations. Fixed confidence values are uncalibrated. Rule fields and explicit human approval control the actual packet. No payer, EHR, bank, email or vendor action is executed by this integration.
