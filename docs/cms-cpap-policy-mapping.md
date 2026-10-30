# Published policy mapping: initial CPAP evidence

Source: [CMS NCD 240.4, version 3](https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=226&ncdver=3), effective March 13, 2008. Reviewed October 30, 2026. Mapping identifier `cpap-evidence-2026-10-30.1`. The checked-in mapping contains paraphrases with section references, not a copy of the whole CMS webpage. It is selected by exact ID, not fetched live; its hash identifies our mapping, not the entire CMS source document. Policy updates require human review and a new mapping version.

This is a **revenue-cycle coverage-evidence preparation** use case. NCD 240.4 is a coverage policy; it is not evidence that this service requires prior authorization. The workflow does not issue an authorization or adjudicate a claim.

| Source | Implemented evidence check | Boundary |
|---|---|---|
| B.1, B.3 | Adult age, supplied OSA diagnosis and dated clinical evaluation | No diagnosis inferred from model prose; age over 120 is an intake exception. |
| B.1, B.5 | Initial 12-week CPAP request | Continued coverage is outside this worker. |
| B.3 | Attended laboratory PSG using AHI | CMS also permits specified home tests; those and RDI-only reports route to manual review here. |
| B.4 | Treating-physician order predates the study; supervision documented | Names/signatures are supplied synthetic text, not identity verification. |
| A, B.7 | Apnea/hypopnea duration, airflow reduction and oxygen-desaturation scoring minima | A report based on 3% desaturation does not establish the required 4% basis. No raw signal analysis. |
| B.5–B.6 | AHI >=15, or 5–14 with a documented listed symptom/comorbidity; compare count/time; short-study event minimum | Count must be a nonnegative integer, sleep time positive and <=1440 minutes (local plausibility bound), AHI calculation within 0.051 rounding tolerance. For less than 120 minutes require 30 events on the >=15 route or 10 on the lower route. AHI between 14 and 15 routes to manual review. |
| B.2 | Completed beneficiary education before use | Caregiver alternative and same-day ordering need manual review. |
| AgentOps controls | Same case across four documents, supplied active Medicare benefit dates, signatures and chronological consistency | These are local packet-integrity controls, not additional CMS coverage requirements. The local sequence is evaluation → study → report → follow-up → referral → start; valid alternative sequences need reconciliation. |

Out of scope: pediatric treatment, home-test/RDI mappings, continued coverage, coverage-with-evidence-development, local coverage determinations, supplier accreditation/order/coding requirements, live eligibility, EHR/payer submission and reimbursement. These require clinical/partner review and, where relevant, another validated mapping or integration. A blocked packet is not a medical or insurance denial.

The supported input contract is four named text documents with explicit labelled fields. Realistic narrative context accompanies the fields, and all documents are supplied to the model reviewers, but deterministic extraction does not resolve arbitrary prose, negation or contradictions outside those labels. Human review must reconcile the originals. Duplicate labels, missing evidence, invalid dates, inconsistent measurements and unsupported source roles cannot silently pass.

The demonstration uses an adult synthetic case with 72 events over 240 minutes: AHI 18. The missing sleep report first blocks the workflow; supplying it creates a new immutable run. Tests also cover the lower AHI branch, qualifying comorbidities, short recordings, count/index inconsistency, missing order, unsupported tests and education gaps.

## Packet contents

The owner JSON export includes all four source texts, the input fingerprint, policy mapping/version/source URL/effective/review dates, source-text hashes, extracted facts, every finding and citation, three model reviews with usage metadata, superseded-run linkage, human decision, timeline and sandbox receipt. The printable pack contains the extracted packet, source quotes, mapped criteria, reviewer notes, decision timeline and remaining human checklist. It excludes full original document bodies. Public shares omit full bodies but disclose extracted facts and quotes only after explicit disclosure acknowledgement.

A receiver receipt proves acceptance by the first-party AgentOps sandbox, not a payer. Model outputs remain advisory; the clinician/operator and relevant payer own their respective decisions. The packet must be reviewed before any real-world use; this application is synthetic-only.
