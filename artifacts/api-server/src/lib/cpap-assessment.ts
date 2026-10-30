import { createHash } from "node:crypto";
import { cpapPolicy, pdfLineReference } from "@workspace/api-zod";
import type {
  ProofInput,
  ProofAnalysis,
  ProofCitation,
  ProofFinding,
  ProofRetrieval,
} from "@workspace/api-zod";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
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
function day(s?: string) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const n = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s
    ? n / 86400000
    : NaN;
}
type Fact = { value?: string; refs: ProofCitation[] };
const number = (f: Fact) =>
  f.value && /^\d+(\.\d+)?$/.test(f.value) ? Number(f.value) : NaN;
const is = (f: Fact, value: string) => f.value?.toLowerCase() === value;
const clinician = (f: Fact) => /^SYN-CLINICIAN-[A-Z0-9-]+$/.test(f.value ?? "");

/** Exact labelled-field extraction; model prose cannot amend clinical facts or the coverage mapping. */
export function assessCpap(
  input: ProofInput,
  saved?: ProofRetrieval,
): ProofAnalysis {
  const citations: ProofCitation[] = [],
    findings: ProofFinding[] = [];
  const fields: Record<string, string> = {};
  function read(label: string, name: string): Fact {
    const refs: ProofCitation[] = [];
    input.documents.forEach((doc, document) => {
      if (doc.name !== name) return;
      doc.text.split(/\r?\n/).forEach((quote, i) => {
        const colon = quote.indexOf(":");
        if (
          colon < 0 ||
          quote.slice(0, colon).trim().toLowerCase() !== label.toLowerCase()
        )
          return;
        const c = {
          id: `d${document + 1}-l${i + 1}`,
          document,
          name,
          line: i + 1,
          ...pdfLineReference(doc, i + 1),
          quote,
          field: label,
          value: quote.slice(colon + 1).trim(),
        };
        refs.push(c);
        if (!citations.some((x) => x.id === c.id)) citations.push(c);
      });
    });
    const value =
      refs.length === 1 && refs[0].value ? refs[0].value : undefined;
    if (value) fields[`${name.replace(".txt", "")} / ${label}`] = value;
    return { value, refs };
  }
  function check(
    id: string,
    facts: Fact[],
    passed: boolean,
    detail: string,
    manual = false,
  ) {
    const criterion = cpapPolicy.criteria.find((c) => c[0] === id)!;
    const missing = facts.some(
      (f) => f.refs.length === 0 || (f.refs.length === 1 && !f.value),
    );
    const ambiguous = facts.some((f) => f.refs.length > 1);
    const status: ProofFinding["status"] = ambiguous
      ? "manual-review"
      : missing
        ? "missing"
        : passed
          ? "met"
          : manual
            ? "manual-review"
            : "not-met";
    findings.push({
      id,
      label: criterion[1],
      passed: status === "met",
      status,
      explanation: `${criterion[3]}. ${detail}${ambiguous ? " Duplicate labelled values require reconciliation." : missing ? " Required labelled evidence is missing." : ""}`,
      citationIds: [...new Set(facts.flatMap((f) => f.refs.map((c) => c.id)))],
    });
  }
  const names = [
    "referral.txt",
    "eligibility-response.txt",
    "clinical-note.txt",
    "sleep-study.txt",
  ];
  const cases = names.map((name) => read("Case reference", name));
  check(
    "case-reference",
    cases,
    cases.every(
      (f) =>
        f.value === cases[0].value && /^SYN-[A-Z0-9-]+$/.test(f.value ?? ""),
    ),
    "Require the same synthetic case across referral, benefit record, clinical note and sleep study.",
  );
  if (cases[0].value) fields["case-reference"] = cases[0].value;
  const r = (label: string) => read(label, "referral.txt"),
    c = (label: string) => read(label, "clinical-note.txt"),
    t = (label: string) => read(label, "sleep-study.txt"),
    b = (label: string) => read(label, "eligibility-response.txt");
  const requested = r("Requested date"),
    start = b("Coverage starts"),
    end = b("Coverage ends"),
    active = b("Coverage status"),
    member = b("Member reference"),
    payer = b("Payer program");
  const reqDay = day(requested.value);
  check(
    "benefit",
    [requested, start, end, active, member, payer],
    is(active, "active") &&
      is(payer, "medicare") &&
      /^SYN-MEMBER-[A-Z0-9-]+$/.test(member.value ?? "") &&
      reqDay >= day(start.value) &&
      reqDay <= day(end.value),
    "Compare supplied benefit dates and program only; eligibility and payment remain unverified.",
  );
  const service = r("Requested service"),
    course = r("Course"),
    weeks = r("Requested weeks");
  check(
    "request",
    [service, course, weeks, requested],
    is(service, "cpap") &&
      is(course, "initial") &&
      number(weeks) === 12 &&
      reqDay >= day(cpapPolicy.effectiveDate),
    "Only initial 12-week CPAP preparation is implemented. Continued coverage and other services need a separate workflow.",
    true,
  );
  const age = c("Age years"),
    evaluation = c("Clinical evaluation date"),
    diagnosis = c("Diagnosis"),
    noteDate = c("Note date");
  check(
    "clinical",
    [age, evaluation, diagnosis, noteDate],
    Number.isInteger(number(age)) &&
      number(age) >= 18 &&
      number(age) <= 120 &&
      is(diagnosis, "obstructive sleep apnea") &&
      day(evaluation.value) <= day(noteDate.value) &&
      day(noteDate.value) <= reqDay,
    "Check the supplied adult age, clinical evaluation date and OSA diagnosis; do not infer a diagnosis. Age over 120 is routed for data review.",
  );
  const type = t("Test type"),
    index = t("Index type"),
    study = t("Study date");
  check(
    "test-type",
    [type, index, study],
    is(type, "attended laboratory psg") &&
      is(index, "ahi") &&
      day(study.value) <= reqDay,
    "Attended laboratory PSG/AHI is the supported route. CMS also accepts specified home studies; those and RDI-only results require manual review here, not a coverage denial.",
    true,
  );
  const ordered = r("Sleep test ordered date"),
    treating = r("Treating physician"),
    supervision = t("Physician supervision"),
    supervisor = t("Supervising physician");
  check(
    "test-order",
    [ordered, treating, study, supervision, supervisor],
    day(ordered.value) < day(study.value) &&
      clinician(treating) &&
      is(supervision, "documented") &&
      clinician(supervisor),
    "Require a prior treating-physician order and supplied supervision documentation. A synthetic name is not verification of licensure or identity.",
  );
  const apnea = t("Apnea minimum seconds"),
    hypo = t("Hypopnea minimum seconds"),
    flow = t("Hypopnea airflow reduction percent"),
    desat = t("Hypopnea desaturation percent");
  check(
    "scoring",
    [apnea, hypo, flow, desat],
    number(apnea) >= 10 &&
      number(hypo) >= 10 &&
      number(flow) >= 30 &&
      number(flow) <= 100 &&
      number(desat) >= 4 &&
      number(desat) <= 100,
    "Use documented event definitions consistent with CMS minimum duration, airflow reduction and oxygen-desaturation requirements. A 3% report does not establish the 4% scoring requirement.",
  );
  const ahi = t("AHI events per hour"),
    minutes = t("Total sleep time minutes"),
    events = t("Apnea-hypopnea events");
  const symptoms = [
    "Excessive daytime sleepiness",
    "Impaired cognition",
    "Mood disorder",
    "Insomnia",
    "Hypertension",
    "Ischemic heart disease",
    "History of stroke",
  ].map(c);
  const qualifying = symptoms.filter((f) => is(f, "documented"));
  const a = number(ahi),
    m = number(minutes),
    n = number(events);
  const high = a >= 15,
    low = a >= 5 && a <= 14;
  const threshold = high ? 15 : 5;
  const consistent =
    m > 0 &&
    m <= 1440 &&
    Number.isInteger(n) &&
    n >= 0 &&
    Number.isFinite(a) &&
    Math.abs((n * 60) / m - a) <= 0.051;
  const sufficient =
    consistent &&
    (high || (low && qualifying.length > 0)) &&
    (m >= 120 || n >= threshold * 2);
  // On the lower AHI route, explicit symptom statuses must be present and unambiguous; none is inferred from prose.
  const symptomsValid = symptoms.every(
    (f) =>
      f.refs.length === 1 &&
      ["documented", "not documented"].includes(f.value?.toLowerCase() ?? ""),
  );
  check(
    "ahi",
    [ahi, minutes, events, ...(high ? [] : symptoms)],
    sufficient && (high || symptomsValid),
    `Reported AHI ${ahi.value ?? "missing"}; ${events.value ?? "missing"} events over ${minutes.value ?? "missing"} minutes. ${high ? "AHI ≥15 route." : "AHI 5–14 requires a documented qualifying symptom/comorbidity."} Recalculate AHI from count and sleep time (0.051 rounding tolerance); if sleep is under two hours require at least ${threshold * 2} events. Nonstandard symptom values need reconciliation. AHI between 14 and 15 is not resolved by this mapping.`,
    a > 14 && a < 15,
  );
  fields["threshold-route"] = high
    ? "CMS B.5.a: AHI at least 15"
    : low
      ? "CMS B.5.b: AHI 5–14 plus documented qualifying condition"
      : "No supported threshold route established";
  const recipient = c("Education recipient"),
    education = c("Device-use education"),
    educationDate = c("Education date");
  check(
    "education",
    [recipient, education, educationDate, requested],
    is(recipient, "beneficiary") &&
      is(education, "completed") &&
      day(educationDate.value) < reqDay &&
      day(educationDate.value) <= day(noteDate.value),
    "Require completed beneficiary instruction before the planned start. Planned education is not completion; same-day timing and caregiver alternatives need manual review.",
    true,
  );
  const referralDate = r("Referral date"),
    reportDate = t("Report date"),
    refSignature = r("Signed by"),
    noteSignature = c("Signed by"),
    reportSignature = t("Signed by");
  check(
    "attestation",
    [
      referralDate,
      noteDate,
      reportDate,
      study,
      evaluation,
      refSignature,
      noteSignature,
      reportSignature,
      treating,
    ],
    clinician(refSignature) &&
      clinician(noteSignature) &&
      clinician(reportSignature) &&
      refSignature.value === treating.value &&
      day(evaluation.value) <= day(study.value) &&
      day(reportDate.value) >= day(study.value) &&
      day(noteDate.value) >= day(reportDate.value) &&
      day(referralDate.value) >= day(noteDate.value) &&
      day(referralDate.value) <= reqDay,
    "Local chronology control: evaluation → test → signed report → signed follow-up → signed referral → requested start. Other sequences require human reconciliation. Signatures are supplied text, not authenticated.",
    true,
  );

  fields["policy-source"] = cpapPolicy.sourceUrl;
  fields["policy-version"] =
    `${cpapPolicy.id}@${cpapPolicy.version}; ${cpapPolicy.mappingVersion}`;
  fields["policy-effective-date"] = cpapPolicy.effectiveDate;
  fields["policy-reviewed-date"] = cpapPolicy.reviewedDate;
  fields["policy-scope"] = cpapPolicy.scope;
  fields["packet-purpose"] =
    "Initial CPAP coverage evidence preparation; synthetic records; human-reviewed sandbox handoff only";
  fields["human-follow-up"] = cpapPolicy.humanChecklist.join("\n");
  const policyText = JSON.stringify(canonical(cpapPolicy));
  fields["mapping-sha256"] = hash(policyText);
  fields["source-manifest"] = input.documents
    .map((d) => `${d.name}: SHA-256 ${hash(d.text)}`)
    .join("\n");
  const retrieval: ProofRetrieval = saved ?? {
    method: "exact-policy-id",
    catalogVersion: cpapPolicy.mappingVersion,
    query: cpapPolicy.id,
    requiredFields: findings.map((f) => f.id),
    missingFields: [],
    passages: cpapPolicy.criteria.map(
      ([field, title, quote, reference], i) => ({
        id: `cms-cpap-${field}`,
        documentId: cpapPolicy.id,
        title: `${reference} · ${title}`,
        version: cpapPolicy.version,
        documentHash: hash(policyText),
        field,
        line: i + 1,
        quote: `${quote} [${reference}; mapping paraphrase, not a quotation. Source: ${cpapPolicy.sourceUrl}]`,
        matchedTerms: [cpapPolicy.id],
        score: 1,
      }),
    ),
  };
  const blockers = findings
    .filter((f) => !f.passed)
    .map((f) => `${f.label}: ${f.status}`);
  if (input.workflow !== "revenue-cycle")
    blockers.push(
      "This coverage-preparation mapping requires the revenue-cycle workflow.",
    );
  if (
    input.documents.some((d) => !names.includes(d.name)) ||
    new Set(input.documents.map((d) => d.name)).size !== input.documents.length
  )
    blockers.push(
      "Use one document for each supported source role; unknown or duplicate documents require reconciliation.",
    );
  if (
    input.documents.some((d) =>
      /ignore (all |previous |prior )?instructions|system prompt|act as|override (the )?(policy|rules)/i.test(
        d.text,
      ),
    )
  )
    blockers.push("Instruction-like source content requires human correction.");
  return {
    policyVersion: fields["policy-version"],
    fingerprint: hash(
      JSON.stringify(canonical({ input, retrieval, policy: cpapPolicy })),
    ),
    fields,
    findings,
    citations,
    blockers,
    retrieval,
    executionMode: "deterministic-rules",
    summary: blockers.length
      ? `${blockers.length} evidence gaps or manual-review items block packet handoff. This is not a coverage denial.`
      : "The supported CMS initial-CPAP evidence checks and local integrity controls passed. Inspect the complete packet and remaining human checklist before sandbox handoff; coverage and payment are not determined.",
  };
}
