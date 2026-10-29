# Executable healthcare administration proof lab

Open `/proof-lab` to evaluate four synthetic authorization/revenue-cycle cases. Document checkboxes and the duplicate flag change the server-side evaluation; edits disable review until the packet is evaluated again. Approval re-evaluates the submitted packet, so missing evidence cannot bypass the gate through direct API calls.

The lab demonstrates typed input validation, versioned administrative policies, evidence provenance, explicit human decisions, deterministic input fingerprints, stable simulator receipt IDs, and downloadable session evidence. It complements the existing multi-agent orchestration, RAG, model telemetry and approval queue.

## API

- `GET /api/proof/scenarios`: list built-in synthetic cases.
- `POST /api/proof/evaluate`: `{scenarioId, documents?, duplicate?}`.
- `POST /api/proof/review`: the same input plus `decision: "approve" | "reject"`.

Allowed document identifiers: `referral`, `coverage`, `supporting-note`, `encounter`, `claim`. Unknown keys, identifiers and decisions are rejected. Invalid input returns 400; unknown scenarios return 404; review with unresolved blockers returns 409. Successful evaluations/reviews return the evidence, packet, policy version, fingerprint, session events and optional sandbox receipt.

## Verification

From `artifacts/api-server`:

```
node --import tsx --test src/__tests__/proof-engine.test.ts src/__tests__/proof-api.test.ts
```

Eight tests cover approval and rejection, blocked approval attempts, changed evidence, fingerprints, HTTP validation and successful sandbox submission. No provider credentials or database are required for these tests.

## Boundary

This is an executable deterministic sandbox using fictional administrative policies. It does not call an LLM, connect to an EHR or payer, perform clinical assessment, store durable healthcare audit records, or demonstrate regulatory compliance. Receipts are simulator outputs, not external acknowledgements. The fingerprint is an input checksum, not a signature or identity proof. Review re-evaluates the packet and emits a fresh event snapshot; exports are session records, not persistent event histories.

The existing application's routes are unauthenticated. These endpoints accept only enumerated synthetic inputs, and never accept patient data. Real deployment needs authenticated reviewers, durable versioned workflow state, validated domain policies, real integration adapters, and operational/security validation. A prospect-specific guided presentation can be built on this lab after that presentation's scope is agreed.
