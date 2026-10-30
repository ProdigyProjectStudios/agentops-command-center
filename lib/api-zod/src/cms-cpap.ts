import type { ProofInput } from "./proof-contract";

/** Reviewed mapping, not a live policy lookup. Section references belong to CMS; administrative controls are ours. */
export const cpapPolicy = {
  id: "CMS-NCD-240.4",
  version: "3",
  mappingVersion: "cpap-evidence-2026-10-30.1",
  title: "CMS CPAP coverage evidence · initial 12-week course",
  sourceUrl:
    "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=226&ncdver=3",
  effectiveDate: "2008-03-13",
  reviewedDate: "2026-10-30",
  disclaimer:
    "Revenue-cycle evidence preparation using synthetic records and published Medicare coverage criteria. This is not a prior-authorization requirement, coverage decision, claim, or medical recommendation.",
  scope:
    "Adult OSA, initial CPAP, attended laboratory PSG using AHI. Home tests, RDI-only reports, continued coverage, pediatric cases and coverage-with-evidence-development require a different mapping and manual review. This mapping does not replace applicable LCDs, supplier documentation, coding, benefit or payment rules.",
  humanChecklist: [
    "Inspect the original reports and reconcile narrative contradictions; this worker reads the labelled fields, not arbitrary clinical prose.",
    "Confirm policy applicability, any local coverage determination and payer-specific documentation or prior-authorization requirements.",
    "Confirm clinician identity, signatures, test supervision and scoring, beneficiary education, supplier/order requirements and benefit eligibility against source systems.",
    "Arrange follow-up during the initial 12 weeks; continued coverage requires evidence of benefit and applicable additional requirements.",
    "Approve only the administrative handoff to the AgentOps sandbox. No insurer or EHR receives this packet.",
  ],
  // id, title, paraphrased requirement, provenance (local controls never masquerade as CMS criteria)
  criteria: [
    [
      "case-reference",
      "Case linkage",
      "All four source roles must identify one synthetic case.",
      "AgentOps intake control",
    ],
    [
      "benefit",
      "Supplied benefit record",
      "One active supplied Medicare record must include a synthetic member and encompass the requested date; this is not an eligibility query.",
      "AgentOps intake control",
    ],
    [
      "request",
      "Initial CPAP request",
      "Scope is adult OSA and an initial 12-week course of CPAP.",
      "CMS §B.1, B.5; bounded worker scope",
    ],
    [
      "clinical",
      "Adult OSA evaluation",
      "A clinical evaluation and documented OSA diagnosis must be present for the adult case.",
      "CMS §B.1, B.3",
    ],
    [
      "test-type",
      "Supported diagnostic test",
      "This mapping implements attended laboratory PSG with an AHI; other CMS-accepted test routes require manual review here.",
      "CMS §B.3; bounded worker scope",
    ],
    [
      "test-order",
      "Ordered and supervised test",
      "The treating physician must have ordered the test beforehand; appropriate physician supervision must be documented.",
      "CMS §B.4",
    ],
    [
      "scoring",
      "Event scoring definition",
      "Apnea lasts at least 10 seconds; hypopnea lasts at least 10 seconds with at least 30% airflow or movement reduction and at least 4% oxygen desaturation.",
      "CMS §A, B.7",
    ],
    [
      "ahi",
      "AHI evidence and threshold",
      "AHI at least 15, or AHI 5–14 with a documented qualifying symptom or comorbidity. For less than two hours of sleep, require the event count that the applicable threshold needs over two hours.",
      "CMS §B.5–B.6",
    ],
    [
      "education",
      "Device education",
      "Document beneficiary instruction in proper device use before CPAP starts. The caregiver alternative is outside this mapping.",
      "CMS §B.2; bounded worker scope",
    ],
    [
      "attestation",
      "Document dates and signatures",
      "Dated, signed referral, clinical note and sleep report must precede the requested start. Supplied signatures are not authenticated.",
      "AgentOps packet integrity control",
    ],
  ] as const,
};

export const cpapSleepReport = {
  name: "sleep-study.txt",
  text: `SYNTHETIC SLEEP LABORATORY REPORT — no real patient data
Case reference: SYN-CPAP-1042
Study date: 2026-10-18
Test type: attended laboratory PSG
Index type: AHI
Total sleep time minutes: 240
Apnea-hypopnea events: 72
AHI events per hour: 18
Apnea minimum seconds: 10
Hypopnea minimum seconds: 10
Hypopnea airflow reduction percent: 30
Hypopnea desaturation percent: 4
Physician supervision: documented
Supervising physician: SYN-CLINICIAN-07
Interpretation: The synthetic study documents obstructive respiratory events. No central apnea or hypoventilation is described in this case. Treating clinician review is required.
Report date: 2026-10-19
Signed by: SYN-CLINICIAN-08`,
};
export function cpapWorkerInput(
  complete = false,
  mode: "rules" | "live-ai" = "rules",
): ProofInput {
  return {
    workflow: "revenue-cycle",
    healthcarePolicy: "cms-cpap-initial-v1",
    title: "CPAP coverage evidence · SYN-CPAP-1042",
    syntheticAcknowledged: true,
    connectedReview: true,
    analysisMode: mode,
    documents: [
      {
        name: "referral.txt",
        text: `SYNTHETIC REFERRAL AND ORDER — no real patient data
Case reference: SYN-CPAP-1042
Requested service: CPAP
Course: initial
Requested weeks: 12
Requested date: 2026-11-02
Treating physician: SYN-CLINICIAN-07
Sleep test ordered date: 2026-10-10
Referral date: 2026-10-20
Signed by: SYN-CLINICIAN-07
Referral narrative: Assemble the CPAP coverage evidence for administrative review. The treating physician retains all clinical decisions. This is not a payer authorization.`,
      },
      {
        name: "eligibility-response.txt",
        text: `SYNTHETIC BENEFIT RECORD — supplied fixture, not an insurer response
Case reference: SYN-CPAP-1042
Member reference: SYN-MEMBER-552
Payer program: Medicare
Coverage status: active
Coverage starts: 2026-01-01
Coverage ends: 2026-12-31
Record note: Synthetic benefit dates do not establish actual eligibility or payment.`,
      },
      {
        name: "clinical-note.txt",
        text: `SYNTHETIC CLINICAL FOLLOW-UP — no real patient data
Case reference: SYN-CPAP-1042
Age years: 67
Clinical evaluation date: 2026-10-09
Diagnosis: obstructive sleep apnea
Excessive daytime sleepiness: documented
Impaired cognition: not documented
Mood disorder: not documented
Insomnia: not documented
Hypertension: not documented
Ischemic heart disease: not documented
History of stroke: not documented
History: The fictional patient describes loud snoring, witnessed pauses in breathing and daytime sleepiness. The clinician reviewed the supplied laboratory study and discussed an initial CPAP course.
Education recipient: beneficiary
Device-use education: completed
Education date: 2026-10-20
Education detail: The fictional beneficiary received instruction on mask placement, device operation and equipment care before the planned start.
Note date: 2026-10-20
Signed by: SYN-CLINICIAN-07`,
      },
      ...(complete ? [{ ...cpapSleepReport }] : []),
    ],
  };
}
