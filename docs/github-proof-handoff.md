# Verified GitHub proof handoff

Completed Proof Lab runs can create a real issue in a dedicated, server-configured GitHub demo repository. A separate GET retrieves the issue and checks its number, canonical URL, run ID and input fingerprint. This is separate from the first-party sandbox receipt and does not imply healthcare delivery.

## Replit setup

Set server secrets:

- `PROOF_GITHUB_REPOSITORY`: dedicated synthetic demo repository, `owner/repo`.
- `PROOF_GITHUB_TOKEN`: fine-grained GitHub token with Issues read/write on that repository only.
- `PROOF_INTEGRATION_KEY`: random operator secret of at least 32 characters. Keep separate from the provider token; enter it only in the Proof Lab handoff control.

Without all three values, external submission fails explicitly as unconfigured. No production credentials or repository were configured during implementation. The operator key is never persisted in localStorage or run evidence. It authorizes this integration; browser workspace ownership remains a capability key, not user authentication.

Complete and approve a synthetic run, then use **External GitHub handoff**. Confirm disclosure before creating the issue. Only run ID, fingerprint, workflow, policy-check count and sandbox receipt ID leave Agent Ops. Full documents, source quotes and operator review notes are excluded.

## Duplicate protection and recovery

A durable row lock records sending before calling GitHub. The same run cannot submit twice. Successful issue IDs are saved before independent verification. Recheck retrieves the saved issue without creating another. A lost response or crash leaves a sending/unverified record and blocks resending, because GitHub issue creation has no idempotency key. Inspect the demo repository by run ID and reconcile manually; this release intentionally offers no automatic resend or delete/reset action. A verified issue is evidence of a GitHub handoff, not a claim that another integration ran.

Existing saved runs need no migration: the optional handoff record is stored in the run JSON snapshot. New shared snapshots and exports can include its public repository and issue link; earlier immutable snapshots remain unchanged.

## Validation

Automated tests cover approval prerequisite, separate POST/GET verification, durable external ID, omission of document/review contents, owner isolation, duplicate prevention and uncertain-delivery protection. Transport tests use simulated GitHub responses and the real proof store with embedded PostgreSQL. A real GitHub round trip remains pending dedicated demo-repository credentials. No live site deployment or production restart was performed for this change.

## Live-test corrections

Explicit dollar amounts in request titles take precedence over scenario estimates. Priority no longer adds an undisclosed surcharge. Without an unambiguous supplied amount, the keyword-based scenario amount remains an estimate requiring operator confirmation. Dollar amounts only are parsed by this existing dollar-denominated workflow.

AI reviewer instructions now forbid treating a supplied identifier as real-world authorization. Server validation replaces detected verification/authorization claims with a bounded explanation of the fictional rule and supplied evidence. This guard addresses observed overclaim wording; it is not a general factual-verification guarantee, and model notes remain advisory.
