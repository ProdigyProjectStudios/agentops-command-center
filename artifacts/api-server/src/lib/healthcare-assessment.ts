import { createHash } from "node:crypto";
import { authorizationPolicy, pdfLineReference } from "@workspace/api-zod";
import type {
  ProofInput,
  ProofAnalysis,
  ProofCitation,
  ProofFinding,
  ProofRetrieval,
} from "@workspace/api-zod";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const day = (s?: string) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const n = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s
    ? n / 86400000
    : NaN;
};

/** A bounded administrative evidence parser. No model output can change these rules. */
export function assessHealthcare(
  input: ProofInput,
  saved?: ProofRetrieval,
): ProofAnalysis {
  const citations: ProofCitation[] = [],
    findings: ProofFinding[] = [];
  const fields: Record<string, string> = {};
  const read = (field: string, pattern: RegExp, file?: string) => {
    const matches: ProofCitation[] = [];
    input.documents.forEach((doc, document) => {
      if (file && doc.name !== file) return;
      doc.text.split(/\r?\n/).forEach((quote, i) => {
        const match = pattern.exec(quote.trim());
        if (match)
          matches.push({
            id: `d${document + 1}-l${i + 1}`,
            document,
            name: doc.name,
            line: i + 1,
            ...pdfLineReference(doc, i + 1),
            quote,
            field,
            value: match[1].trim(),
          });
      });
    });
    for (const c of matches)
      if (!citations.some((x) => x.id === c.id)) citations.push(c);
    return matches;
  };
  const unique = (xs: ProofCitation[]) =>
    xs.length === 1 ? xs[0].value : undefined;
  const rule = (
    id: string,
    refs: ProofCitation[],
    passed: boolean,
    explanation: string,
  ) => {
    const policy = authorizationPolicy.criteria.find((c) => c[0] === id)!;
    findings.push({
      id,
      label: policy[1],
      passed,
      explanation,
      citationIds: refs.map((c) => c.id),
    });
  };
  const cases = read("case-reference", /^Case reference:\s*(.*)$/i);
  const linked =
    cases.length === input.documents.length &&
    input.documents.every(
      (_d, i) => cases.filter((c) => c.document === i).length === 1,
    ) &&
    cases.every(
      (c) => /^SYN-[A-Z0-9-]+$/.test(c.value) && c.value === cases[0].value,
    );
  rule(
    "case-reference",
    cases,
    linked,
    linked
      ? "Every source identifies the same synthetic case."
      : "Each document needs exactly one matching synthetic case reference.",
  );
  if (linked) fields["case-reference"] = cases[0].value;
  const member = read(
    "member",
    /^Member reference:\s*(.*)$/i,
    "eligibility-response.txt",
  );
  const memberValue = unique(member);
  rule(
    "member",
    member,
    !!memberValue && /^SYN-MEMBER-[A-Z0-9-]+$/.test(memberValue),
    "Use one synthetic member reference from the supplied eligibility response; no identity verification is claimed.",
  );
  if (memberValue) fields.member = memberValue;
  const date = read(
    "requested-date",
    /^Requested date:\s*(.*)$/i,
    "referral.txt",
  );
  const start = read(
    "coverage-start",
    /^Coverage starts:\s*(.*)$/i,
    "eligibility-response.txt",
  );
  const end = read(
    "coverage-end",
    /^Coverage ends:\s*(.*)$/i,
    "eligibility-response.txt",
  );
  const status = read(
    "coverage-status",
    /^Coverage status:\s*(.*)$/i,
    "eligibility-response.txt",
  );
  const requested = day(unique(date)),
    first = day(unique(start)),
    last = day(unique(end));
  rule(
    "coverage",
    [...date, ...start, ...end, ...status],
    unique(status)?.toLowerCase() === "active" &&
      requested >= first &&
      requested <= last,
    "The requested date must fall within one unambiguous supplied active coverage period. This is a date comparison, not an insurer lookup.",
  );
  if (unique(date)) fields["requested-date"] = unique(date)!;
  if (unique(start) && unique(end))
    fields["supplied-coverage-period"] = `${unique(start)} to ${unique(end)}`;
  const service = read(
    "service",
    /^Requested service:\s*(.*)$/i,
    "referral.txt",
  );
  rule(
    "service",
    service,
    unique(service) === "SYN-IMAGING-01",
    "This policy covers only the fictional service SYN-IMAGING-01.",
  );
  if (unique(service)) fields.service = unique(service)!;
  const referrer = read(
    "referrer",
    /^Referring clinician:\s*(.*)$/i,
    "referral.txt",
  );
  rule(
    "referrer",
    referrer,
    /^SYN-CLINICIAN-[A-Z0-9-]+$/.test(unique(referrer) ?? ""),
    "One synthetic referring clinician must be named.",
  );
  if (unique(referrer)) fields.referrer = unique(referrer)!;
  const symptoms = read(
    "symptoms",
    /^Symptoms have persisted for (\d+) weeks\.$/i,
    "supporting-note.txt",
  );
  rule(
    "symptoms",
    symptoms,
    !!unique(symptoms) &&
      Number(unique(symptoms)) >= 8 &&
      Number(unique(symptoms)) <= 520,
    "The supplied symptom-duration sentence must document 8–520 weeks under the fictional policy. Missing or ambiguous evidence blocks preparation.",
  );
  if (unique(symptoms)) fields["symptom-weeks"] = unique(symptoms)!;
  const therapy = read(
    "therapy",
    /^A supervised conservative-care course was completed over (\d+) weeks\.$/i,
    "supporting-note.txt",
  );
  rule(
    "therapy",
    therapy,
    !!unique(therapy) &&
      Number(unique(therapy)) >= 6 &&
      Number(unique(therapy)) <= 520,
    "The supplied completed-care sentence must document 6–520 weeks. A planned course is not completed care.",
  );
  if (unique(therapy)) fields["completed-care-weeks"] = unique(therapy)!;
  const impact = read(
    "function",
    /^Functional impact:\s*(.*)$/i,
    "supporting-note.txt",
  );
  rule(
    "function",
    impact,
    (unique(impact)?.length ?? 0) >= 20 &&
      !/^(none|unknown|not documented|n\/a)\b/i.test(unique(impact) ?? ""),
    "A substantive reported functional-impact statement must be supplied and inspected by the operator. Its clinical accuracy is not established by this check.",
  );
  if (unique(impact)) fields["reported-functional-impact"] = unique(impact)!;
  const signature = read(
    "signature",
    /^Signed by:\s*(.*)$/i,
    "supporting-note.txt",
  );
  rule(
    "signature",
    signature,
    /^SYN-CLINICIAN-[A-Z0-9-]+$/.test(unique(signature) ?? ""),
    "One synthetic note signatory must be supplied; electronic signature authenticity is not verified.",
  );
  if (unique(signature)) fields["note-signatory"] = unique(signature)!;
  const noteDate = read(
    "note-date",
    /^Note date:\s*(.*)$/i,
    "supporting-note.txt",
  );
  const age = requested - day(unique(noteDate));
  rule(
    "note-date",
    [...noteDate, ...date],
    age >= 0 && age <= 90,
    "The signed note must be dated within the 90 days before the requested service date.",
  );
  if (unique(noteDate)) fields["note-date"] = unique(noteDate)!;
  fields["policy-version"] =
    `${authorizationPolicy.id}@${authorizationPolicy.version}`;
  fields["packet-purpose"] =
    "Synthetic administrative preparation; human-reviewed; sandbox only";
  const policyText = authorizationPolicy.criteria.map((c) => c[2]).join("\n");
  const retrieval: ProofRetrieval = saved ?? {
    method: "exact-policy-id",
    catalogVersion: authorizationPolicy.version,
    query: authorizationPolicy.id,
    requiredFields: findings.map((f) => f.id),
    missingFields: [],
    passages: authorizationPolicy.criteria.map(([field, title, quote], i) => ({
      id: `auth-policy-${i + 1}`,
      documentId: authorizationPolicy.id,
      title,
      version: authorizationPolicy.version,
      documentHash: hash(policyText),
      field,
      line: i + 1,
      quote,
      matchedTerms: [authorizationPolicy.id],
      score: 1,
    })),
  };
  const blockers = findings.filter((f) => !f.passed).map((f) => f.label);
  if (input.workflow !== "authorization")
    blockers.push(
      "Authorization evidence policy cannot be used for another workflow.",
    );
  if (
    input.documents.some(
      (d) =>
        ![
          "referral.txt",
          "eligibility-response.txt",
          "supporting-note.txt",
        ].includes(d.name),
    ) ||
    new Set(input.documents.map((d) => d.name)).size !== input.documents.length
  )
    blockers.push(
      "Use one document per supported source: referral.txt, eligibility-response.txt, supporting-note.txt.",
    );
  if (
    input.documents.some((d) =>
      /ignore (all |previous |prior )?instructions|system prompt|act as|override (the )?(policy|rules)/i.test(
        d.text,
      ),
    )
  )
    blockers.push(
      "Instruction-like content in source evidence requires operator correction.",
    );
  return {
    policyVersion: fields["policy-version"],
    fingerprint: hash(
      JSON.stringify(
        canonical({ input, retrieval, policy: authorizationPolicy }),
      ),
    ),
    fields,
    findings,
    citations,
    blockers,
    retrieval,
    executionMode: "deterministic-rules",
    summary: blockers.length
      ? `${blockers.length} evidence gaps require human correction. No packet can be submitted.`
      : "Ten administrative evidence checks passed. Review the cited packet before approving sandbox submission.",
  };
}
