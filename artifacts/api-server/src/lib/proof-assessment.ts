import { assessHealthcare } from "./healthcare-assessment";
import { createHash } from "node:crypto";
import { pdfLineReference } from "@workspace/api-zod";
import type { ProofRetrieval } from "@workspace/api-zod";
import { retrieveProofPolicy } from "./proof-policy";
import type {
  ProofInput,
  ProofAnalysis,
  ProofCitation,
  ProofFinding,
} from "@workspace/api-zod";

export const proofPolicy = "synthetic-operations-2026-10-v2";
export const hashProof = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function canonicalJson(value: unknown): string {
  function ordered(item: any): any {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, ordered(item[key])]),
      );
    return item;
  }
  return JSON.stringify(ordered(value));
}

/** Exact line extraction: source content is data, never executable instructions. */
export function assessProof(
  input: ProofInput,
  savedRetrieval?: ProofRetrieval,
): ProofAnalysis {
  if (input.healthcarePolicy) return assessHealthcare(input, savedRetrieval);
  const citations: ProofCitation[] = [];
  const fields: Record<string, string> = {};
  const findings: ProofFinding[] = [];
  const rules: [string, string, (value: string) => boolean][] =
    input.workflow === "vendor-payment"
      ? [
          [
            "vendor",
            "Synthetic vendor",
            (v) => /^SYNTHETIC-[A-Z0-9-]+$/i.test(v),
          ],
          [
            "invoice",
            "Synthetic invoice reference",
            (v) => /^SYN-[A-Z0-9-]+$/i.test(v),
          ],
          [
            "amount",
            "Amount is positive and at most 5,000",
            (v) =>
              /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 5000,
          ],
          [
            "currency",
            "Supported currency",
            (v) => ["EUR", "USD", "GBP"].includes(v.toUpperCase()),
          ],
          [
            "purchase-order",
            "Purchase order supplied",
            (v) => /^SYN-[A-Z0-9-]+$/i.test(v),
          ],
          [
            "service-confirmed",
            "Service delivery confirmed",
            (v) => v.toLowerCase() === "yes",
          ],
        ]
      : [
          [
            "case-reference",
            "Synthetic case reference",
            (v) => /^SYN-[A-Z0-9-]+$/i.test(v),
          ],
          [
            "coverage",
            "Coverage marked active",
            (v) => v.toLowerCase() === "active",
          ],
          ...(input.workflow === "authorization"
            ? ([
                [
                  "referral",
                  "Referral present",
                  (v: string) => v.toLowerCase() === "present",
                ],
                [
                  "supporting-note",
                  "Supporting note present",
                  (v: string) => v.toLowerCase() === "present",
                ],
              ] as [string, string, (v: string) => boolean][])
            : ([
                [
                  "encounter",
                  "Encounter evidence present",
                  (v: string) => v.toLowerCase() === "present",
                ],
                [
                  "claim-reference",
                  "Synthetic claim reference",
                  (v: string) => /^SYN-[A-Z0-9-]+$/i.test(v),
                ],
                [
                  "duplicate",
                  "No duplicate flagged in input",
                  (v: string) => v.toLowerCase() === "no",
                ],
              ] as [string, string, (v: string) => boolean][])),
        ];
  for (const [field, label, accepts] of rules) {
    const matches: ProofCitation[] = [];
    input.documents.forEach((doc, document) =>
      doc.text.split(/\r?\n/).forEach((quote, i) => {
        const colon = quote.indexOf(":");
        if (colon < 0 || quote.slice(0, colon).trim().toLowerCase() !== field)
          return;
        matches.push({
          id: `d${document + 1}-l${i + 1}`,
          document,
          name: doc.name,
          line: i + 1,
          ...pdfLineReference(doc, i + 1),
          quote,
          field,
          value: quote.slice(colon + 1).trim(),
        });
      }),
    );
    citations.push(...matches);
    const match = matches.length === 1 ? matches[0] : undefined;
    if (match) fields[field] = match.value;
    const passed = !!match && accepts(match.value);
    findings.push({
      id: field,
      label,
      passed,
      citationIds: matches.map((m) => m.id),
      explanation:
        matches.length === 0
          ? `Required field "${field}" was not found in any supplied document.`
          : matches.length > 1
            ? `Found ${matches.length} occurrences of "${field}"; ambiguous inputs require correction.`
            : passed
              ? `The extracted value "${match!.value}" meets this fictional policy rule.`
              : `The extracted value "${match!.value}" does not meet this fictional policy rule.`,
    });
  }
  const blockers = findings.filter((f) => !f.passed).map((f) => f.label);
  const retrieval = input.connectedReview
    ? (savedRetrieval ?? retrieveProofPolicy(input))
    : undefined;
  if (retrieval?.missingFields.length)
    blockers.push(
      `Insufficient policy evidence: ${retrieval.missingFields.join(", ")}`,
    );
  return {
    ...(retrieval ? { retrieval } : {}),
    policyVersion: proofPolicy,
    fingerprint: hashProof(
      canonicalJson({
        input,
        policy: proofPolicy,
        ...(retrieval ? { retrieval } : {}),
      }),
    ),
    fields,
    citations,
    findings,
    blockers,
    summary: blockers.length
      ? `${blockers.length} check(s) need correction. No submission is permitted.`
      : `${findings.length} checks passed. An operator must review the cited evidence before submission.`,
    executionMode: "deterministic-rules",
  };
}
