import { createHash } from "node:crypto";

// Fictional administrative policies, deliberately limited to synthetic fixtures.
// No clinical decisions, payer connectivity, PHI, or live provider calls.
export const POLICY_VERSION = "synthetic-admin-2026-10-v1";
export const scenarios = [
  {
    id: "authorization-ready",
    title: "Authorization • complete packet",
    workflow: "authorization",
    description:
      "Build a submission packet from a complete synthetic referral.",
    documents: ["referral", "coverage", "supporting-note"],
    duplicate: false,
  },
  {
    id: "authorization-missing",
    title: "Authorization • missing evidence",
    workflow: "authorization",
    description: "Detect a missing supporting note and stop submission.",
    documents: ["referral", "coverage"],
    duplicate: false,
  },
  {
    id: "revenue-ready",
    title: "Revenue cycle • clean claim",
    workflow: "revenue-cycle",
    description: "Check a synthetic claim packet and route it to review.",
    documents: ["coverage", "encounter", "claim"],
    duplicate: false,
  },
  {
    id: "revenue-duplicate",
    title: "Revenue cycle • duplicate claim",
    workflow: "revenue-cycle",
    description:
      "Identify a duplicate reference and prevent a second submission.",
    documents: ["coverage", "encounter", "claim"],
    duplicate: true,
  },
] as const;
export type ScenarioId = (typeof scenarios)[number]["id"];
export type ReviewDecision = "approve" | "reject";
export function evaluateScenario(
  id: string,
  decision?: ReviewDecision,
  overrides: { documents?: string[]; duplicate?: boolean } = {},
) {
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) throw new Error("Unknown synthetic scenario");
  const documents = overrides.documents ?? [...scenario.documents];
  const duplicate = overrides.duplicate ?? scenario.duplicate;
  const required =
    scenario.workflow === "authorization"
      ? ["referral", "coverage", "supporting-note"]
      : ["coverage", "encounter", "claim"];
  const evidence = required.map((document) => ({
    document,
    present: documents.includes(document),
    source: `fixture://${scenario.id}/${document}`,
    rule: `${POLICY_VERSION}: required ${document}`,
  }));
  const blockers = evidence
    .filter((e) => !e.present)
    .map((e) => `Missing ${e.document}`);
  if (duplicate)
    blockers.push("Duplicate synthetic claim reference SYN-CLAIM-002");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        scenarioId: scenario.id,
        documents: [...new Set(documents)].sort(),
        duplicate,
        policy: POLICY_VERSION,
      }),
    )
    .digest("hex");
  const assessedAt = new Date().toISOString();
  const status = blockers.length
    ? "blocked"
    : decision === "reject"
      ? "rejected"
      : decision === "approve"
        ? "sandbox-submitted"
        : "awaiting-review";
  const events = [
    {
      at: assessedAt,
      actor: "system",
      action: "Validated synthetic fixture",
      detail: scenario.id,
    },
    {
      at: assessedAt,
      actor: "policy-engine",
      action: "Checked versioned evidence requirements",
      detail: POLICY_VERSION,
    },
    {
      at: assessedAt,
      actor: "policy-engine",
      action: blockers.length ? "Blocked submission" : "Requested human review",
      detail:
        blockers.join("; ") ||
        "All required documents present; operator decision required",
    },
  ];
  if (decision)
    events.push({
      at: assessedAt,
      actor: "operator",
      action: `Review requested: ${decision}`,
      detail: blockers.length
        ? "Approval refused because blockers remain"
        : "Decision received through review endpoint",
    });
  const receipt =
    status === "sandbox-submitted"
      ? {
          id: `SIM-${fingerprint.slice(0, 16)}`,
          adapter: "local-sandbox",
          externalDelivery: false,
          idempotencyKey: fingerprint,
        }
      : null;
  if (receipt)
    events.push({
      at: assessedAt,
      actor: "sandbox-adapter",
      action: "Generated sandbox receipt",
      detail: receipt.id,
    });
  return {
    schemaVersion: "1.0",
    policyVersion: POLICY_VERSION,
    scenarioId: scenario.id,
    title: scenario.title,
    mode: "synthetic-sandbox",
    status,
    fingerprint,
    assessedAt,
    evidence,
    blockers,
    receipt,
    events,
    packet: {
      subjectReference: "SYNTHETIC-PATIENT-001",
      workflow: scenario.workflow,
      documents,
      duplicate,
      destination: "local-sandbox",
      policyVersion: POLICY_VERSION,
    },
    capabilities: {
      rulesExecuted: true,
      humanReviewRequired: true,
      liveLLM: false,
      liveEHR: false,
      livePayer: false,
      persistentAudit: false,
    },
  };
}
