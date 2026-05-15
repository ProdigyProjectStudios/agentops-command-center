import type { NodeDefinition } from "./types";
import { opsTriageNode } from "./nodes/ops-triage";
import { memoryLookupNode } from "./nodes/memory-lookup";
import { legalReviewNode } from "./nodes/legal-review";
import { financeReviewNode } from "./nodes/finance-review";
import { communicationsDraftNode } from "./nodes/communications-draft";
import { synthesisNode } from "./nodes/synthesis";
import { createApprovalNode } from "./nodes/create-approval";
import { finalizeNode } from "./nodes/finalize";

export const PIPELINE: NodeDefinition[] = [
  opsTriageNode,
  memoryLookupNode,
  legalReviewNode,
  financeReviewNode,
  communicationsDraftNode,
  synthesisNode,
  createApprovalNode,
];

export const FINALIZE_NODE = finalizeNode;
