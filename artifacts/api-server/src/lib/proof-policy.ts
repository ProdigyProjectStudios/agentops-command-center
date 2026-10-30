import type { ProofInput, ProofRetrieval } from "@workspace/api-zod";
import { createHash } from "node:crypto";

export const catalogVersion = "synthetic-policy-catalog-v1";
export const policyCatalog = [
  {
    id: "vendor-policy",
    workflow: "vendor-payment",
    title: "Synthetic vendor invoice controls",
    version: "1",
    clauses: [
      [
        "vendor",
        "Vendor invoice policy: vendor must be a SYNTHETIC- identifier; this does not verify an actual vendor.",
      ],
      ["invoice", "Vendor invoice policy: invoice must have a SYN- reference."],
      [
        "amount",
        "Vendor invoice policy: amount must be positive, at most 5000, and have at most two decimal places.",
      ],
      ["currency", "Vendor invoice policy: currency must be EUR, USD or GBP."],
      [
        "purchase-order",
        "Vendor invoice policy: purchase-order must have a SYN- reference.",
      ],
      [
        "service-confirmed",
        "Vendor invoice policy: service-confirmed must be yes in the supplied evidence.",
      ],
    ],
  },
  {
    id: "authorization-policy",
    workflow: "authorization",
    title: "Synthetic authorization packet controls",
    version: "1",
    clauses: [
      [
        "case-reference",
        "Authorization packet policy: case-reference must have a SYN- reference.",
      ],
      [
        "coverage",
        "Authorization packet policy: coverage must be marked active in the supplied evidence; this does not establish real coverage.",
      ],
      [
        "referral",
        "Authorization packet policy: referral must be marked present.",
      ],
      [
        "supporting-note",
        "Authorization packet policy: supporting-note must be marked present.",
      ],
    ],
  },
  {
    id: "revenue-policy",
    workflow: "revenue-cycle",
    title: "Synthetic revenue-cycle packet controls",
    version: "1",
    clauses: [
      [
        "case-reference",
        "Revenue cycle policy: case-reference must have a SYN- reference.",
      ],
      [
        "coverage",
        "Revenue cycle policy: coverage must be marked active in supplied evidence.",
      ],
      ["encounter", "Revenue cycle policy: encounter must be marked present."],
      [
        "claim-reference",
        "Revenue cycle policy: claim-reference must have a SYN- reference.",
      ],
      [
        "duplicate",
        "Revenue cycle policy: duplicate must be no in the supplied evidence; this is not an external claims search.",
      ],
    ],
  },
] as const;
const terms = (text: string) => [
  ...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []),
];
const defaults = {
  "vendor-payment": "vendor invoice",
  authorization: "authorization packet",
  "revenue-cycle": "revenue cycle",
};
export function retrieveProofPolicy(input: ProofInput): ProofRetrieval {
  const query = input.policyQuery || defaults[input.workflow];
  const tokens = terms(query);
  const relevant = policyCatalog.filter((d) => d.workflow === input.workflow);
  const requiredFields = relevant.flatMap((d) => d.clauses.map((c) => c[0]));
  const passages: ProofRetrieval["passages"] = [];
  for (const doc of relevant) {
    const documentHash = createHash("sha256")
      .update(doc.clauses.map((c) => c[1]).join("\n"))
      .digest("hex");
    doc.clauses.forEach(([field, quote], i) => {
      const words = new Set(terms(quote));
      const matchedTerms = tokens.filter((t) => words.has(t));
      if (matchedTerms.length)
        passages.push({
          id: `${doc.id}:${doc.version}:${i + 1}`,
          documentId: doc.id,
          title: doc.title,
          version: doc.version,
          documentHash,
          field,
          line: i + 1,
          quote,
          matchedTerms,
          score: matchedTerms.length,
        });
    });
  }
  passages.sort((a, b) => b.score - a.score || a.line - b.line);
  return {
    method: "keyword",
    catalogVersion,
    query,
    requiredFields,
    passages,
    missingFields: requiredFields.filter(
      (field) => !passages.some((p) => p.field === field),
    ),
  };
}
