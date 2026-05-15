import type { NodeDefinition } from "./types";
import { opsTriageNode } from "./nodes/ops-triage-node";
import { memoryLookupNode } from "./nodes/memory-lookup-node";
import { legalReviewNode } from "./nodes/legal-review-node";
import { financeReviewNode } from "./nodes/finance-review-node";
import { communicationsDraftNode } from "./nodes/communications-draft-node";
import { synthesisNode } from "./nodes/synthesis-node";
import { createApprovalNode } from "./nodes/create-approval-node";
import { finalizeNode } from "./nodes/finalize-node";

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
