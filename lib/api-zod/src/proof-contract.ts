import { z } from "zod";

const pdfOrigin = z
  .object({
    name: z.string().trim().min(1).max(100),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const proofDocumentSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(16000),
    pdf: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        reviewed: z.boolean(),
        pageStarts: z.array(z.number().int().positive()).min(1).max(20),
      })
      .strict()
      .optional(),
    editedFromPdf: pdfOrigin.optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (!doc.pdf) return;
    const starts = doc.pdf.pageStarts;
    const lines = doc.text.split(/\r?\n/).length;
    if (
      starts[0] !== 1 ||
      starts.some((n, i) => n > lines || (i > 0 && n <= starts[i - 1]))
    )
      ctx.addIssue({
        code: "custom",
        message: "PDF page references must cover ordered source lines.",
      });
    if (doc.editedFromPdf)
      ctx.addIssue({
        code: "custom",
        message: "Edited evidence cannot retain PDF page references.",
      });
    if (!doc.pdf.reviewed)
      ctx.addIssue({
        code: "custom",
        message: "Review every PDF page before evaluating.",
      });
  });
export type ProofDocument = z.infer<typeof proofDocumentSchema>;

export const proofInputSchema = z
  .object({
    workflow: z.enum(["vendor-payment", "authorization", "revenue-cycle"]),
    title: z.string().trim().min(3).max(120),
    syntheticAcknowledged: z.literal(true),
    recoveryDemo: z.boolean().optional(),
    analysisMode: z.enum(["rules", "live-ai"]).optional(),
    documents: z.array(proofDocumentSchema).min(1).max(4),
  })
  .strict();
export const proofReviewSchema = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().min(3).max(500),
  })
  .strict();
export type ProofInput = z.infer<typeof proofInputSchema>;
export type ProofReview = z.infer<typeof proofReviewSchema>;
export type ProofCitation = {
  id: string;
  document: number;
  name: string;
  line: number;
  page?: number;
  pageLine?: number;
  sourceKind?: "pdf-text" | "edited-pdf-text";
  quote: string;
  field: string;
  value: string;
};
export type ProofFinding = {
  id: string;
  label: string;
  passed: boolean;
  explanation: string;
  citationIds: string[];
};
export type ProofAnalysis = {
  policyVersion: string;
  fingerprint: string;
  fields: Record<string, string>;
  citations: ProofCitation[];
  findings: ProofFinding[];
  blockers: string[];
  summary: string;
  executionMode: "deterministic-rules";
  aiReview?: {
    model: string;
    notes: { findingId: string; explanation: string; citationIds: string[] }[];
    inputTokens: number | null;
    outputTokens: number | null;
    durationMs: number;
    estimatedCostMicros: number | null;
  };
};
export type ProofReceipt = {
  id: string;
  runId: string;
  fingerprint: string;
  acceptedAt: string;
  destination: "AgentOps sandbox ledger";
  externalDelivery: false;
  packet: Record<string, string>;
};
export type ProofEvent = { at: string; action: string; detail: string };
export type ProofRun = {
  githubHandoff?: {
    status: "sending" | "unverified" | "verified";
    repository: string;
    issueNumber: number | null;
    url: string | null;
    verifiedAt: string | null;
  };
  id: string;
  input: ProofInput;
  analysis: ProofAnalysis;
  status:
    | "blocked"
    | "awaiting-review"
    | "rejected"
    | "delivering"
    | "delivery-failed"
    | "completed";
  createdAt: string;
  updatedAt: string;
  review: (ProofReview & { at: string; actor: "browser operator" }) | null;
  receipt: ProofReceipt | null;
  delivery: {
    attempts: number;
    lastAttemptAt: string | null;
    verifiedAt: string | null;
    error: string | null;
  };
  events: ProofEvent[];
};
export type ProofPublicRun = Omit<ProofRun, "input"> & {
  input: Omit<ProofInput, "documents"> & { documents: { name: string }[] };
};
export type ProofShare = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
export const proofTemplates: {
  id: string;
  title: string;
  description: string;
  input: ProofInput;
}[] = [
  {
    id: "vendor",
    title: "Vendor invoice",
    description:
      "Extract an invoice, check purchase evidence, and deliver an approved packet.",
    input: {
      workflow: "vendor-payment",
      title: "Synthetic vendor invoice",
      syntheticAcknowledged: true,
      documents: [
        {
          name: "invoice.txt",
          text: "Vendor: SYNTHETIC-STUDIO\nInvoice: SYN-INV-1042\nAmount: 2400\nCurrency: EUR\nPurchase-order: SYN-PO-1042\nService-confirmed: yes",
        },
      ],
    },
  },
  {
    id: "authorization",
    title: "Authorization packet",
    description:
      "Check administrative evidence before preparing a synthetic submission.",
    input: {
      workflow: "authorization",
      title: "Synthetic authorization packet",
      syntheticAcknowledged: true,
      documents: [
        {
          name: "referral.txt",
          text: "Case-reference: SYN-CASE-1042\nCoverage: active\nReferral: present\nSupporting-note: present",
        },
      ],
    },
  },
  {
    id: "revenue",
    title: "Revenue-cycle packet",
    description:
      "Validate a claim reference and its supporting administrative documents.",
    input: {
      workflow: "revenue-cycle",
      title: "Synthetic revenue-cycle packet",
      syntheticAcknowledged: true,
      documents: [
        {
          name: "claim.txt",
          text: "Case-reference: SYN-CASE-2042\nCoverage: active\nEncounter: present\nClaim-reference: SYN-CLAIM-2042\nDuplicate: no",
        },
      ],
    },
  },
];
