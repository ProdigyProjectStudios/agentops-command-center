import type {
  ProofGraph,
  ProofGraphSnapshot,
  ProofRun,
} from "@workspace/api-zod";
import { hashProof, canonicalJson } from "./proof-assessment";
import { ProofError, type SqlClient } from "./proof-store";

export interface ProofGraphAdapter {
  withLock<T>(id: string, work: () => Promise<T>): Promise<T>;
  prepare(run: ProofRun, client: SqlClient): Promise<number>;
  execute(id: number, mode: ProofGraph["mode"]): Promise<ProofGraphSnapshot>;
  finalize(run: ProofRun): Promise<NonNullable<ProofGraph["finalization"]>>;
}
export function graphFingerprint(run: ProofRun, snapshot: ProofGraphSnapshot) {
  return hashProof(
    canonicalJson({
      input: run.analysis.fingerprint,
      workflowRunId: run.graph!.workflowRunId,
      mode: run.graph!.mode,
      snapshot,
    }),
  );
}
export function assertGraphReviewed(run: ProofRun) {
  if (!run.graph) return;
  if (
    run.graph.state !== "ready" ||
    !run.graph.snapshot ||
    graphFingerprint(run, run.graph.snapshot) !== run.graph.fingerprint ||
    run.review?.graphFingerprint !== run.graph.fingerprint
  )
    throw new ProofError(
      409,
      "The saved graph output must be completed and included in human review.",
    );
}
