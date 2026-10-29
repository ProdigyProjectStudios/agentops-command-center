import type { ProofRun, ProofPublicRun } from "@workspace/api-zod";
import { proofPackHtml } from "@workspace/api-zod";
export { proofPackSummary } from "@workspace/api-zod";
type Run = ProofRun | ProofPublicRun;
export function downloadProofPack(run: Run) {
  const url = URL.createObjectURL(
    new Blob([proofPackHtml(run)], { type: "text/html;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `agentops-proof-pack-${run.id}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
