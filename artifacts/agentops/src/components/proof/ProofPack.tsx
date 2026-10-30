import type { ProofRun, ProofPublicRun } from "@workspace/api-zod";
import { proofPackSummary, downloadProofPack } from "@/lib/proof-pack";
export function ProofPack({ run }: { run: ProofRun | ProofPublicRun }) {
  const s = proofPackSummary(run);
  return (
    <section className="rounded-xl border border-primary/30 bg-card p-5 md:p-7 space-y-5 min-w-0">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">
          Execution proof pack
        </p>
        <h2 className="text-xl md:text-2xl font-semibold mt-2">{s.outcome}</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        {[
          [
            "Evidence",
            `${s.passed}/${s.total} checks passed · ${s.documents} source documents`,
          ],
          ["Human control", s.decision],
          ["Execution", s.ai],
          ["Verified outcome", s.receipt],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border p-4 min-w-0"
          >
            <p className="text-muted-foreground mb-2">{label}</p>
            <p className="break-words">{value}</p>
          </div>
        ))}
      </div>
      {s.recovery && <p className="text-sm text-primary">{s.recovery}</p>}
      {run.githubHandoff && (
        <p className="text-sm break-words">
          GitHub handoff: {run.githubHandoff.repository} · #
          {run.githubHandoff.issueNumber ?? "unknown"} ·{" "}
          {run.githubHandoff.status}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Synthetic evidence. Sandbox delivery is first-party. Cited quotes and
        timeline review notes appear in the downloadable pack. Saved graph
        outputs may quote uploaded text. Original files and workspace
        credentials are excluded. Review before sharing.
      </p>
      <button
        className="rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm"
        onClick={() => downloadProofPack(run)}
      >
        Download printable proof pack
      </button>
    </section>
  );
}
