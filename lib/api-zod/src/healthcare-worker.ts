import type { ProofInput } from "./proof-contract";

export const authorizationPolicy = {
  id: "SYN-AUTH-EVIDENCE",
  version: "1.0",
  title: "Fictional authorization evidence policy",
  disclaimer:
    "Synthetic administrative evaluation only. These invented criteria are not medical guidance, an actual payer policy, or a coverage decision.",
  criteria: [
    [
      "case-reference",
      "Case linkage",
      "Every document must identify the same synthetic case.",
    ],
    [
      "member",
      "Member reference",
      "The supplied eligibility response must contain a synthetic member identifier.",
    ],
    [
      "coverage",
      "Coverage period",
      "The requested date must fall within the supplied active coverage period. No insurer lookup is performed.",
    ],
    [
      "service",
      "Requested service",
      "The referral must request the fictional service SYN-IMAGING-01.",
    ],
    [
      "referrer",
      "Referral signatory",
      "The referral must name a synthetic referring clinician.",
    ],
    [
      "symptoms",
      "Documented duration",
      "The signed note must document 8–520 weeks of symptoms under this fictional policy.",
    ],
    [
      "therapy",
      "Documented prior care",
      "The signed note must document a completed supervised care course lasting 6–520 weeks.",
    ],
    [
      "function",
      "Functional impact",
      "The signed note must describe the reported functional impact in at least 20 characters.",
    ],
    [
      "signature",
      "Note signature",
      "The supporting note must name a synthetic signatory. This checks supplied text, not identity.",
    ],
    [
      "note-date",
      "Note recency",
      "The signed note date must be no later than the requested service date and no more than 90 days earlier.",
    ],
  ] as const,
};

export const authorizationSupportingNote = {
  name: "supporting-note.txt",
  text: `SYNTHETIC CASE — no real patient data
Case reference: SYN-AUTH-1042
Note date: 2026-10-20
Symptoms have persisted for 10 weeks.
A supervised conservative-care course was completed over 8 weeks.
Functional impact: The fictional patient reports difficulty standing through a normal work shift and completing household tasks.
Signed by: SYN-CLINICIAN-07
This fictional note demonstrates evidence handling, not a clinical recommendation.`,
};

export function authorizationWorkerInput(
  complete = false,
  mode: "rules" | "live-ai" = "rules",
): ProofInput {
  return {
    workflow: "authorization",
    healthcarePolicy: "authorization-evidence-v1",
    title: "Authorization evidence worker · SYN-AUTH-1042",
    syntheticAcknowledged: true,
    connectedReview: true,
    analysisMode: mode,
    documents: [
      {
        name: "referral.txt",
        text: `SYNTHETIC CASE — no real patient data
Case reference: SYN-AUTH-1042
Requested service: SYN-IMAGING-01
Requested date: 2026-11-02
Referring clinician: SYN-CLINICIAN-07
Referral narrative: Please assemble the supplied evidence for administrative review of the fictional imaging request. Do not infer medical necessity.`,
      },
      {
        name: "eligibility-response.txt",
        text: `SYNTHETIC ELIGIBILITY RESPONSE — supplied fixture, not an insurer connection
Case reference: SYN-AUTH-1042
Member reference: SYN-MEMBER-552
Coverage status: active
Coverage starts: 2026-01-01
Coverage ends: 2026-12-31
Plan: SYN-DEMONSTRATION-PLAN`,
      },
      ...(complete ? [{ ...authorizationSupportingNote }] : []),
    ],
  };
}
