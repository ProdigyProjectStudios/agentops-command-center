import { useState } from "react";
import type { ProofRun } from "@workspace/api-zod";
import { proofApi } from "@/lib/proof-api";

export function GithubHandoff({
  run,
  onUpdate,
}: {
  run: ProofRun;
  onUpdate: (run: ProofRun) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handoff = run.githubHandoff;
  async function act(action: "send" | "verify") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onUpdate(
        await proofApi<ProofRun>(
          `/runs/${run.id}/github/${action}`,
          "POST",
          { confirmExternal: confirmed },
          { "x-proof-integration-key": key },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Handoff failed");
    } finally {
      setBusy(false);
      setKey("");
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-semibold">External GitHub handoff</h2>
      <p className="text-sm text-muted-foreground">
        Create a real issue in the server-configured demo repository, then
        independently retrieve it. Only the run ID, fingerprint, workflow, check
        count and sandbox receipt ID are sent.
      </p>
      {handoff && (
        <p role="status" className="text-sm">
          {handoff.status} · {handoff.repository}{" "}
          {handoff.issueNumber
            ? `#${handoff.issueNumber}`
            : "· delivery needs manual reconciliation"}
        </p>
      )}
      {handoff?.url && (
        <a
          className="text-primary underline"
          href={handoff.url}
          target="_blank"
          rel="noreferrer"
        >
          Inspect external issue
        </a>
      )}
      {handoff?.verifiedAt && (
        <p className="text-sm">
          Independently verified {new Date(handoff.verifiedAt).toLocaleString()}
        </p>
      )}
      <label className="block text-sm">
        Integration operator key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="block w-full rounded border border-border bg-background p-2 mt-1"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Requires server configuration and a separate operator key. The key is
        cleared after each request and is not saved in browser storage.
      </p>
      {!handoff && (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Create a synthetic issue in the configured external demo repository.
        </label>
      )}
      <button
        className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
        disabled={
          busy ||
          !key ||
          (!handoff && !confirmed) ||
          (!!handoff && !handoff.issueNumber)
        }
        onClick={() => act(handoff ? "verify" : "send")}
      >
        {busy
          ? "Contacting GitHub…"
          : handoff
            ? "Recheck external issue"
            : "Create & verify external issue"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
