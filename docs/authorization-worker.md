# Authorization evidence worker

Route: `/workers/authorization`. This is the live-provider workflow for the healthcare demonstration. `/demo/healthcare` remains the original preset-graph rehearsal and links here.

## Demonstrate one complete case

1. Inspect the supplied synthetic referral and eligibility response. **Check evidence** saves a blocked run because the signed supporting note is missing.
2. The operator explicitly supplies the synthetic note. Its narrative documents symptom duration, completed care, reported functional impact, date and signatory. Edit any field to exercise other exceptions. Rechecking creates a new run linked to its predecessor.
3. Review the ten fictional policy criteria and their exact source lines. Checks include consistent case references, supported fictional service, member/referrer markers, coverage dates, completed care duration, reported functional impact, note signature and recency. Dates must be real calendar dates. Ambiguous matches, missing sources, case mismatches and unsupported source roles block preparation.
4. Acknowledge provider usage and **Run live AI worker**. Three sequential specialists review the complete source documents, frozen policy, source findings and preceding specialist outputs. Every specialist must cover every finding with valid finding-specific source IDs. Missing credentials, provider failure, schema failure, omitted findings and invented citations fail closed. No successful worker run or substitute demo output is created on failure. Earlier rule results remain available.
5. Inspect the source-derived packet and advisory model notes. The human explicitly approves or rejects with a note. Backend enforcement requires all three live reviews; calling the approval endpoint on a rules-only case also fails. The decision binds the canonical source and policy fingerprint.
6. Approval triggers the existing real HTTP sandbox submission and independent receiver verification. Rejection creates no receipt. Recheck the receiver, export JSON or printable proof, and optionally create a disclosed read-only link. Shares expire and can be revoked in Proof Lab. A failed delivery retries the same approved run ID.
7. Discuss the demonstrated reusable capabilities, partner-supplied requirements, ownership/licensing, pricing, deployment and support. No commercial terms are pre-agreed by the software.

## Scope and boundaries

The model review is live when a configured provider successfully responds. Extraction and administrative gates are deterministic; the model interprets and checks evidence but does not control submission. This separation is deliberate. The bounded input contract uses `referral.txt`, `eligibility-response.txt` and `supporting-note.txt`, with the exact labelled fields and duration sentences shown in the sample. It does not implement general medical PDF/OCR extraction or arbitrary clinical-note understanding.

The policy `SYN-AUTH-EVIDENCE@1.0` is invented for evaluation, including its duration thresholds and fictional service code. It is not a real insurer policy or medical guidance. Eligibility responses are supplied fixtures, not insurer queries. No EHR, payer, clinical decision, actual signature verification, coverage determination, claim payment or external authorization is demonstrated. The worker is an existing runnable administrative component; production healthcare readiness is not claimed.

Model outputs are advisory and may be inaccurate despite citation and schema checks. The operator must inspect the source and interpretation. Instruction-like source patterns are blocked, and prompts treat documents as untrusted data; this is not a claim of comprehensive prompt-injection resistance. This synthetic portfolio environment retains capability-key workspaces and legacy unauthenticated operational routes; do not introduce real patient data.

## Deployment

Use the existing Node API, PostgreSQL database and frontend. No new service, paid subscription or schema table is required. Existing startup proof migrations remain in place; do not run the destructive seed against production.

Set either `OPENAI_API_KEY`, or the existing Replit pair `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`. Model selection uses existing per-agent/global settings for `ops-conductor`, `legal-counsel` and `finance-analyst`. The new three-review worker does not require the separate original-graph integration key. Each successful run makes three provider calls; failed calls may be retried by the provider SDK. No credential is stored in the browser.

Before recording the final video, deploy this revision, run the complete case against the configured actual provider, inspect all model outputs and verify the saved receipt. A working health endpoint or successful fixture-based test is not that verification. Retain actual model, token and duration metadata from the recording run.

## Validation

`healthcare-worker.test.ts` covers narrative evidence, policy snapshots, source fidelity, canonical fingerprints, case mismatch, coverage expiry, impossible dates, unsupported services, insufficient/planned care, missing signatures, stale/future notes, duplicate durations, instruction-like source input, model failures and invalid citations. Its HTTP/PostgreSQL test covers usage consent, approval locks, linked corrections and ownership, receipt creation, exports, read-only shares/revocation, rejection and database close/reopen persistence.

`authorization-worker.spec.ts` drives the real browser and backend for approval, mobile rejection, reload, receipt recheck, export/share, and provider failure. CI runs an explicitly labelled local HTTP provider fixture after the existing E2E suite. This exercises the actual provider adapter and source prompts, but does not measure model quality or prove a real-provider run. QA recordings are labelled accordingly and must not be presented as live-AI sales footage.

The browser stores only the last saved run ID. Unsaved edits, consent, review acknowledgement and freshly created share links are not restored. Database reopen tests do not establish restart behavior of the deployed hosting environment. Model-review failure is retried as a new full analysis, not resumed from saved partial specialist outputs.

## Verified revision

On 2026-10-30, revision `3ca26dd` passed all **166 API tests** and **19 browser tests** (16 existing, 3 new worker scenarios). Type checks, both production builds and Python checks passed. Desktop and mobile browser screenshots were visually inspected; the mobile test confirmed no horizontal overflow. [API/build CI](https://github.com/ProdigyProjectStudios/agentops-command-center/actions/runs/40992898082) · [Browser CI](https://github.com/ProdigyProjectStudios/agentops-command-center/actions/runs/40992898193). The subsequent commit only updates this validation record and the README.

The browser/provider integration evidence is from the explicitly labelled CI provider fixture. This revision has not been verified against the deployed real provider and does not establish production restart durability.
