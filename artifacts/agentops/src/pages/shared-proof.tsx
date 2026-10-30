import { ProofPack } from "@/components/proof/ProofPack";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FileJson, ShieldCheck } from "lucide-react";
import type { ProofPublicRun } from "@workspace/api-zod";
import {
  ProofEvidence,
  proofPanel,
  proofButton,
  proofDate,
} from "@/components/proof/ProofEvidence";
import { proofApiBase, downloadProof } from "@/lib/proof-api";

export default function SharedProofPage() {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const change = () => setToken(window.location.hash.slice(1));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const result = useQuery({
    queryKey: ["shared-proof", token],
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch(`${proofApiBase}/shared`, {
        headers: { "x-proof-share": token },
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "This proof is unavailable.");
      return body as ProofPublicRun;
    },
  });
  const run = result.data;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8 md:px-8 space-y-6">
        <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-widest">
          <ShieldCheck size={18} /> AgentOps / shared execution evidence
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Inspect the proof.
        </h1>
        <p className="text-muted-foreground max-w-3xl">
          A read-only snapshot of a synthetic workflow. Source quotes, policy
          checks, the operator’s decision and the sandbox result are preserved
          together.
        </p>
        {result.isPending ? (
          <p role="status">Loading shared proof…</p>
        ) : result.isError ? (
          <div role="alert" className={proofPanel}>
            {result.error.message}
          </div>
        ) : run ? (
          <>
            <div
              className={`${proofPanel} flex flex-wrap justify-between gap-4 items-center`}
            >
              <div>
                <h2 className="text-xl font-semibold">{run.input.title}</h2>
                <p className="text-sm text-primary mt-2">
                  {run.status.replaceAll("-", " ")}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Run created {proofDate(run.createdAt)}
                </p>
              </div>
              <button
                className={proofButton}
                onClick={() =>
                  downloadProof(run, `agentops-shared-proof-${run.id}.json`)
                }
              >
                <FileJson size={16} /> Download snapshot
              </button>
            </div>
            <ProofPack run={run} />
            <details className={proofPanel}>
              <summary className="cursor-pointer font-semibold">
                Inspect full source evidence and execution timeline
              </summary>
              <div className="mt-5">
                <ProofEvidence key={run.id} run={run} />
              </div>
            </details>
            <p className="text-xs text-muted-foreground">
              This link grants viewing only. Original source files and workspace
              credentials are excluded; saved graph outputs may quote uploaded
              text. The owner can revoke access; already downloaded copies
              cannot be recalled. No external healthcare or financial action is
              demonstrated.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
