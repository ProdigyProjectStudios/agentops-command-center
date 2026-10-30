# CMS CPAP coverage evidence worker

Route: `/workers/authorization` (retained for existing links). Navigation label: **Coverage Worker**. The current worker is a revenue-cycle evidence-preparation case using published CMS coverage criteria. `/demo/healthcare` remains the separate original graph rehearsal and links to this worker.

## Demonstrate one complete case

1. Inspect the synthetic referral, benefit record and clinical follow-up. **Check evidence** saves a blocked run: the sleep study is missing.
2. The operator supplies the synthetic sleep report. It records attended laboratory PSG, AHI 18 from 72 events over 240 minutes, scoring definitions, supervision, date and signature. Recheck to save a corrected run linked to its predecessor.
3. Inspect the [published CMS policy mapping](cms-cpap-policy-mapping.md). Each finding identifies its CMS section or local intake-control origin and exact source lines. Missing, not-met and manual-review outcomes are distinguished. Unsupported pathways are not treated as payer denials.
4. Acknowledge provider usage and **Run live AI worker**. Three specialists receive all four source documents, frozen policy and findings. Intake and policy-mapping reviews run concurrently; the packet reviewer then receives both completed reviews. Each must cover every finding with valid source IDs. Provider/schema/citation failure stops the run without substitute output; rules-only results cannot be approved.
5. Inspect the exact extracted packet, model notes, source hashes, policy provenance and remaining human checklist. Record an explicit approval or rejection with a note. Approval binds the immutable source/policy fingerprint.
6. Approval performs the existing real HTTP sandbox POST followed by an independent receipt read. Rejection performs no handoff. Verify the receiver again, export the complete source/evidence JSON or printable packet, and optionally create a disclosed read-only link. Failed delivery retries the same approved run ID. Proof Lab manages revocation and history.
7. Explain the current component a partner can evaluate: evidence intake, published-policy mapping, model review, exception management, human control and auditable handoff. A partner would provide policy applicability validation, additional formats, integrations and operating/commercial requirements. No partnership terms are implied.

## Boundaries and compatibility

This is initial CPAP coverage preparation, **not a prior-authorization requirement, coverage determination or reimbursement**. The policy is real; records are synthetic. The bounded mapping supports adult OSA, initial 12-week CPAP, attended lab PSG and AHI. Other pathways, local coverage rules and payer/supplier requirements remain human/partner work; see the complete mapping boundary document.

Extraction uses labelled fields in `referral.txt`, `eligibility-response.txt`, `clinical-note.txt` and `sleep-study.txt`. The model reviews full documents but does not rewrite source facts or override gates. Arbitrary medical PDF/OCR extraction, identity/signature validation, live eligibility, payer/EHR connectivity and production healthcare readiness are not implemented. Source records and model outputs require human review.

Legacy fictional-policy runs remain inspectable and are assessed using their original `authorization-evidence-v1` implementation. New cases use `cms-cpap-initial-v1`; the browser uses a separate saved-case pointer so older cases are not relabelled as CMS evidence. No existing run is rewritten.

## Deployment and actual-provider verification

Merge the reviewed change and republish the existing Replit application with its existing PostgreSQL data and credentials. No new service, subscription or table is required. Do not seed production. Keep either `OPENAI_API_KEY` or the Replit pair `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL`; The CMS worker defaults to `gpt-6-luna` with reasoning disabled for concise review; `HEALTHCARE_REVIEW_MODEL` optionally overrides it. This scoped default supersedes stored per-agent/global settings for the CMS worker only. The provider must support the selected model: an unavailable model fails visibly without substituting demo evidence. Other workflows retain their existing model settings. Aggregate review duration measures elapsed time, while each specialist retains its own duration and token/cost estimate. Real provider latency and output quality must be checked after deployment; parallel calls and shorter explanations are optimizations, not a speed guarantee.

This three-review worker does not require the separate original-graph integration key.

After deployment, run steps 1–6 against the actual provider. Confirm the CMS title/version, three actual model outputs and token metadata, human approval, independent receipt check, reload and exported packet. Keep that real run for the recording. Successful CI provider-fixture results do not establish real model quality or deployed behavior. A health endpoint alone does not establish readiness.

## Validation

`cpap-worker.test.ts` covers source fidelity, provenance, canonical fingerprints, high/lower AHI branches and boundaries, short recordings, scoring, comorbidities, missing/duplicate data, unsupported tests, invalid chronology and printable packet content/escaping. `healthcare-worker.test.ts` retains the old worker checks and runs both policies through real HTTP, a persistent SQL store, approval/ownership locks, linked correction, receipt, JSON export, disclosed share/revocation, rejection and database close/reopen.

`authorization-worker.spec.ts` exercises the CMS flow in browser CI: exception → correction → provider adapter → persisted human decision → receipt → export/share; mobile rejection/overflow and provider failure. CI's HTTP provider fixture is explicitly labelled and is not actual AI. The ordinary CI job also runs the existing PostgreSQL-dependent suites. CI recordings must not be presented as live-AI sales footage.

Browser persistence restores the last saved run; unsaved edits and consent are not restored. Database close/reopen tests do not prove deployed-host restart behavior. No credentials are stored in the browser. The synthetic portfolio environment retains capability-key workspaces and legacy unauthenticated operational routes; never introduce real patient data.

## Verified revision

On 2026-10-30 application/test revision `900a277` passed **206/206 API tests** and **19/19 browser tests**, with no skipped tests. TypeScript checks, both production builds and Python checks passed. Desktop and mobile screenshots were visually inspected and the mobile overflow check passed. [API/build CI](https://github.com/ProdigyProjectStudios/agentops-command-center/actions/runs/40996428505) · [browser CI](https://github.com/ProdigyProjectStudios/agentops-command-center/actions/runs/40996428451). The following commit updates documentation only.

A direct browser check of the live site still showed the earlier fictional policy on 2026-10-30. The CMS version requires merge/deployment and an actual-provider end-to-end check before recording. The CI fixture footage is not the sales demo.
