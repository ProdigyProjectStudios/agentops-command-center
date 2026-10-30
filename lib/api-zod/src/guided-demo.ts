import type { ProofInput } from "./proof-contract";

export type HealthcareDemo = "authorization" | "revenue-cycle";
export const healthcareDemos = {
  authorization: {
    title: "Authorization preparation",
    description:
      "An incomplete referral stops. A person supplies the missing evidence before submission.",
    problem: "The supporting note is missing.",
    findingId: "supporting-note",
    intervention: "Supply the synthetic supporting note",
    confirmation:
      "I have supplied the synthetic supporting note for this case.",
    changed:
      "A supporting-note.txt document is added. The original blocked run remains unchanged.",
    reviewNote:
      "Reviewed the referral, coverage marker and newly supplied supporting-note evidence. The decision below applies only to this sandbox packet.",
  },
  "revenue-cycle": {
    title: "Revenue-cycle preparation",
    description:
      "A claim flagged as duplicate stops. A person reconciles the flag before review.",
    problem: "The supplied claim is flagged as duplicate.",
    findingId: "duplicate",
    intervention: "Record synthetic duplicate reconciliation",
    confirmation:
      "I have reconciled the duplicate flag in this synthetic case.",
    changed:
      "The supplied Duplicate field changes from yes to no. This demonstrates an input flag check, not a lookup in an external claims system.",
    reviewNote:
      "Reviewed the synthetic claim evidence and reconciled duplicate flag. The decision below applies only to this sandbox packet.",
  },
} as const;

/** Guided demos call the same intake/review endpoints as the Proof Lab. */
export function healthcareDemoInput(
  workflow: HealthcareDemo,
  repaired: boolean,
): ProofInput {
  return {
    workflow,
    title: `${healthcareDemos[workflow].title} · ${repaired ? "ready for review" : "exception case"}`,
    syntheticAcknowledged: true,
    analysisMode: "rules",
    documents:
      workflow === "authorization"
        ? [
            {
              name: "referral.txt",
              text: "Case-reference: SYN-DEMO-AUTH-001\nReferral: present",
            },
            { name: "coverage.txt", text: "Coverage: active" },
            ...(repaired
              ? [
                  {
                    name: "supporting-note.txt",
                    text: "Supporting-note: present",
                  },
                ]
              : []),
          ]
        : [
            {
              name: "encounter.txt",
              text: "Case-reference: SYN-DEMO-CLAIM-001\nCoverage: active\nEncounter: present",
            },
            {
              name: "claim.txt",
              text: `Claim-reference: SYN-CLAIM-DEMO-001\nDuplicate: ${repaired ? "no" : "yes"}`,
            },
          ],
  };
}

export const healthcareDemoSteps = [
  {
    title: "Set the scope",
    question: "What is working today?",
    notes:
      "Frame this as a working synthetic administrative workflow. The checks and HTTP receipt execute now; clinical judgments and external healthcare integrations are outside this demo.",
  },
  {
    title: "Inspect the case",
    question: "What evidence comes in?",
    notes:
      "Open the source documents. Explain the Field: value text format and synthetic records. Real document formats, policy rules and source-system adapters would need a scoped pilot.",
  },
  {
    title: "Handle the exception",
    question: "Where does a person step in?",
    notes:
      "Show the failed check and its source—or missing source. Do not skip the blocked state. Explicitly supply or reconcile the evidence, creating a new run instead of overwriting the old one.",
  },
  {
    title: "Run the agents",
    question: "What executes automatically?",
    notes:
      "Run the original graph in demo mode. Open a saved node and the tool record. The engine and keyword lookup execute now; narratives are preset and other tools are simulations. Show all seven saved nodes before moving to approval.",
  },
  {
    title: "Review the decision",
    question: "Who controls the action?",
    notes:
      "Inspect the exact source line before approving. The operator supplies a note. Show that approval binds the source packet and saved graph outputs. Live AI is a separate Proof Lab option; this walkthrough makes no model calls.",
  },
  {
    title: "Verify the outcome",
    question: "Can we inspect what happened?",
    notes:
      "Show the saved timeline and receiver record. Verify the receipt again, then demonstrate a read-only proof link or export. The receipt proves first-party sandbox delivery, not delivery to a payer.",
  },
  {
    title: "Discuss partnership",
    question: "What would a partnership require?",
    notes:
      "Start by asking whether the demonstrated capabilities meet their criteria for an existing partner solution. Identify any must-have gaps before discussing a pilot. Support, IP, pricing and integration access remain terms to agree—not capabilities to imply.",
  },
] as const;
