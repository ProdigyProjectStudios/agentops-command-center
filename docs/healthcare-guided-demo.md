# Healthcare partner walkthrough

Route: `/demo/healthcare`, available from **Guided Demo** in the sidebar from Overview, command search and the Proof Lab. This is a guided presentation of existing saved proof workflows, not a separate simulated backend. The page is lazy-loaded to keep its presentation code out of the initial app bundle.

![Guided original-agent execution](screenshots/guided-agent-execution.jpg)

## Meeting flow

1. **Set the scope.** Choose authorization preparation or revenue-cycle preparation. Distinguish working controls, human responsibilities and integration readiness. Demo graph mode is explicit throughout; there are no model charges.
2. **Inspect the case.** Show the exact synthetic source text that will be sent to the API. Run the evidence checks.
3. **Handle the exception.** The server must return a blocked result. The inspector opens the missing supporting note or flagged-duplicate finding. The operator explicitly supplies/reconciles the evidence; correction creates a second run and retains the original exception.
4. **Run the agents.** Execute the real original Node graph in demo mode. Inspect seven saved node outputs, keyword lookup results and simulated tool labels. Resume the same workflow if interrupted. Human review remains locked until the graph is ready.
5. **Review the decision.** Inspect the corrected source line. Review/edit the suggested operator note and choose approve or reject. Both actions use the same server review endpoint as Proof Lab and bind the source and graph fingerprints. The original finalization node records the decision.
6. **Verify the outcome.** An approved case has a saved sandbox HTTP receipt. Recheck the receiver ledger during the walkthrough before advancing, checking the input fingerprint, graph fingerprint and linked workflow ID. A rejected case has no delivery and can proceed to the discussion as an example of human control. Open the full run, export its evidence, or create an explicitly disclosed read-only proof link. Existing shares can be managed/revoked from the full Proof Lab page.
7. **Discuss partnership fit.** Assess which demonstrated capabilities fit an existing partner solution, which integrations must already work, and ownership of policy, approvals, support, commercial terms and IP. A pilot is conditional on establishing fit. Download a JSON session summary containing run references and next discussion points.

**Presenter notes** toggles a short cue for the current stage. Avoid implying a production healthcare worker or existing healthcare integration: this demonstration uses synthetic administrative fields, deterministic policy checks, preset graph narratives and first-party sandbox delivery. The graph engine executes; preset narratives are not extracted facts. The duplicate demonstration checks an input flag; it does not query a claims system. Live AI is a separate optional Proof Lab mode and still needs a successful configured-provider verification before demonstrating it as live.

## Controls and recovery

- Later stages unlock from actual API run states. A completed approved packet also requires an explicit receipt recheck in the walkthrough before the partnership stage unlocks.
- A random browser workspace key continues to protect proof records through the existing Proof API. This page adds no new public mutation endpoints or identity claims.
- This tab's workflow, step and run IDs are stored in version-2 sessionStorage. Older walkthrough pointers are not migrated; their saved runs remain in Proof Lab history. Reload fetches saved runs again and restores progress. Presenter notes, disclosure acknowledgment and newly created share URLs are not stored there.
- If a saved run is unavailable, the page offers retry or a new walkthrough without assuming earlier success.
- **Start fresh** resets local walkthrough pointers only. It never deletes runs, receipts or share links. Runs remain in Proof Lab history.
- Failed/interrupted approved delivery exposes the existing retry action. Run-ID idempotency remains enforced server-side. A rejected run whose graph finalization failed exposes a retry that records rejection without authorizing delivery.
- The scenario configuration and exact inputs live in `lib/api-zod/src/guided-demo.ts`. The page uses the same intake, review, receipt, export and sharing APIs as the main Proof Lab.

## Before presenting

1. Merge/pull the reviewed change and republish the existing Replit deployment. This development pass did not deploy it.
2. On the deployed URL, run one synthetic case through approval and receipt verification. Open its share link separately. Check the same browser retains its workspace key.
3. Start fresh in the presenter tab and choose authorization first. Keep the original blocked run accessible when showing the corrected result.
4. Show the revenue-cycle case if relevant, including the ability to reject a packet that passes policy checks.
5. Agree required existing capabilities and integration gaps before proposing any implementation, timeline, pricing, support promise or IP arrangement.

No prospect names, private correspondence, meeting details or personal data are embedded in the page or repository.

## Validation

The presentation pass adds `healthcare-demo.spec.ts`: real backend browser scenarios for authorization approval with seven graph nodes and receipt verification, revenue-cycle rejection without delivery, reload restoration, mobile navigation and overview/command-search entry points. These tests use synthetic data and require the seeded test database. Results are tracked in PR checks.

Presentation commit `b5f9ae6` passed all 150 API tests and all 16 browser tests on PostgreSQL 16/pgvector, including the three new guided-demo scenarios. [API CI](https://github.com/ProdigyProjectStudios/agentops-command-center/actions/runs/40985029529) · [Browser CI](https://github.com/ProdigyProjectStudios/agentops-command-center/actions/runs/40985029535). See `original-graph-proof.md` for integration coverage and its limits. The guided demo does not establish live model quality, production restart durability, external healthcare integration or voice behavior.

Desktop execution and mobile stage-layout screenshots were captured by browser CI on commit `444f457` and visually reviewed. Both CI checks passed again on that commit. Manual cloud-preview navigation was blocked by access policy; these are isolated CI screenshots, not production captures.
