import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  cpapPolicy,
  cpapSleepReport,
  cpapWorkerInput,
  type ProofInput,
  type ProofRun,
  type ProofReceipt,
} from "@workspace/api-zod";
import { proofApi, downloadProof } from "@/lib/proof-api";
import {
  ProofEvidence,
  proofButton as button,
  proofPanel as panel,
} from "@/components/proof/ProofEvidence";
import { ProofPack } from "@/components/proof/ProofPack";

const pointer = "agentops-cms-cpap-worker-v1";
const stages = [
  "Source evidence",
  "Policy checks",
  "Live AI review",
  "Human decision",
  "Verified outcome",
];
export default function AuthorizationWorkerPage() {
  const [input, setInput] = useState<ProofInput>(() => cpapWorkerInput());
  const [run, setRun] = useState<ProofRun | null>(null);
  const [prior, setPrior] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [consent, setConsent] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [note, setNote] = useState("");
  const [verified, setVerified] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const [share, setShare] = useState("");
  const [editOpen, setEditOpen] = useState(true);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    const id = localStorage.getItem(pointer);
    if (!id) {
      setRestoring(false);
      return;
    }
    proofApi<ProofRun>(`/runs/${id}`)
      .then((saved) => {
        if (!active) return;
        if (saved.input.healthcarePolicy !== "cms-cpap-initial-v1")
          throw new Error("Saved run is not an authorization worker case.");
        setRun(saved);
        setInput(saved.input);
        setPrior(saved.input.supersedesRunId ?? null);
        setEditOpen(false);
      })
      .catch((e) => {
        if (active) setError(`Could not restore the saved case: ${e.message}`);
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const live =
    !!run?.analysis.aiReview && run.analysis.specialists?.length === 3;
  const step =
    run?.receipt || run?.status === "rejected"
      ? 4
      : live
        ? 3
        : run && !run.analysis.blockers.length
          ? 2
          : run
            ? 1
            : 0;
  const save = (value: ProofRun) => {
    setRun(value);
    setInput(value.input);
    setPrior(value.input.supersedesRunId ?? null);
    localStorage.setItem(pointer, value.id);
    setInspected(false);
    setVerified(false);
    setShare("");
    setDisclose(false);
    setEditOpen(false);
  };
  async function act(label: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The action failed. No successful outcome is assumed.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  function edit(documents: ProofInput["documents"]) {
    if (run) setPrior(run.id);
    setRun(null);
    setInput({
      ...input,
      documents,
      analysisMode: "rules",
      liveCostAcknowledged: false,
    });
    setInspected(false);
    setVerified(false);
    setShare("");
    setConsent(false);
    setEditOpen(true);
    // Keep the last saved run pointer until a replacement is saved. Unsaved edits never masquerade as saved evidence.
  }
  async function evaluate(mode: "rules" | "live-ai") {
    await act(
      mode === "live-ai"
        ? "Running three cited specialist reviews…"
        : "Checking supplied evidence…",
      async () => {
        save(
          await proofApi<ProofRun>("/runs", "POST", {
            ...input,
            analysisMode: mode,
            connectedReview: true,
            liveCostAcknowledged: mode === "live-ai" && consent,
            supersedesRunId: run?.id ?? prior ?? undefined,
          }),
        );
      },
    );
  }
  async function decide(decision: "approve" | "reject") {
    if (!run) return;
    await act("Recording the human decision…", async () =>
      save(
        await proofApi<ProofRun>(`/runs/${run.id}/review`, "POST", {
          fingerprint: run.analysis.fingerprint,
          decision,
          note,
        }),
      ),
    );
  }
  return (
    <main
      className="mx-auto max-w-6xl p-4 md:p-8 space-y-6"
      aria-busy={!!busy || restoring}
    >
      <header className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-9">
        <div className="flex flex-wrap gap-2 text-xs text-primary uppercase tracking-widest">
          <span>Healthcare operations</span>
          <span>·</span>
          <span>Synthetic evidence</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-3">
          CPAP coverage evidence worker
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Turn a referral, benefit record, clinical note and sleep study into an
          inspectable revenue-cycle packet. Missing evidence stops the workflow.
          A person controls the final handoff.
        </p>
        <div className="flex flex-wrap gap-3 mt-5 text-xs">
          <span className="rounded-full border px-3 py-1.5">
            {live
              ? "3 provider reviews recorded"
              : "Live AI not yet demonstrated for this case"}
          </span>
          <span className="rounded-full border px-3 py-1.5">
            CMS NCD 240.4 · version {cpapPolicy.version}
          </span>
          <span className="rounded-full border px-3 py-1.5">
            First-party sandbox destination
          </span>
        </div>
      </header>
      <ol
        className="grid grid-cols-2 lg:grid-cols-5 gap-2"
        aria-label="Worker progress"
      >
        {stages.map((name, i) => (
          <li
            key={name}
            aria-current={step === i ? "step" : undefined}
            className={`rounded-xl border p-3 text-sm ${step === i ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <span className="text-xs text-muted-foreground block mb-1">
              0{i + 1}
            </span>
            {name}
          </li>
        ))}
      </ol>
      {restoring && <p role="status">Restoring the saved case…</p>}
      {busy && (
        <p role="status" className="flex gap-2 items-center text-primary">
          <Loader2 size={16} className="animate-spin" />
          {busy}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/40 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          [
            "Automatic",
            "Source extraction, date and policy checks, three live specialist reviews, packet assembly and receipt verification.",
          ],
          [
            "Human responsibility",
            "Supply missing evidence, resolve ambiguity, inspect the cited packet, and approve or reject with a review note.",
          ],
          [
            "Integration boundary",
            "Eligibility is supplied as a fixture. No EHR lookup, payer submission, medical decision or reimbursement is claimed.",
          ],
        ].map(([title, text]) => (
          <section key={title} className={panel}>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-2">{text}</p>
          </section>
        ))}
      </div>
      <section className={panel}>
        <div className="flex flex-wrap justify-between gap-3 items-center">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <FileCheck2 size={19} />
            1. Inspect the source case
          </h2>
          <button
            className={button}
            disabled={!!busy || restoring}
            onClick={() => setEditOpen(!editOpen)}
          >
            {editOpen ? "Collapse documents" : "Inspect or edit documents"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Supported evidence format: four named clinical text documents with the
          labelled fields shown below. This worker does not claim unrestricted
          clinical-document extraction. Editing creates a new run; saved records
          remain unchanged.
        </p>
        {editOpen && (
          <div className="mt-5 space-y-4">
            {input.documents.map((d, i) => (
              <label key={d.name} className="block text-sm font-medium">
                {d.name}
                <textarea
                  aria-label={d.name}
                  disabled={!!busy || restoring}
                  className="block w-full mt-2 rounded-lg border bg-background p-3 font-mono text-xs leading-6 min-h-44"
                  value={d.text}
                  onChange={(e) =>
                    edit(
                      input.documents.map((x, j) =>
                        j === i ? { ...x, text: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
        )}
        {!input.documents.some((d) => d.name === "sleep-study.txt") && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
            <p className="text-sm">
              The sleep-study report is intentionally missing. Check the case
              first to retain the blocked result.
            </p>
            <button
              className={`${button} mt-3`}
              disabled={!!busy || restoring || !run || run.status !== "blocked"}
              onClick={() =>
                edit([...input.documents, structuredClone(cpapSleepReport)])
              }
            >
              Supply the synthetic sleep study
            </button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className={`${button} bg-primary text-primary-foreground`}
            disabled={!!busy || restoring}
            onClick={() => evaluate("rules")}
          >
            Check evidence
          </button>
          <button
            className={button}
            disabled={!!busy || restoring}
            onClick={() => {
              localStorage.removeItem(pointer);
              setRun(null);
              setPrior(null);
              setInput(cpapWorkerInput());
              setConsent(false);
              setInspected(false);
              setVerified(false);
              setShare("");
              setError("");
              setNote("");
              setEditOpen(true);
            }}
          >
            Start a fresh case
          </button>
          {prior && (
            <Link
              className={`${button} text-primary`}
              href={`/proof-lab/${prior}`}
            >
              Inspect preceding run
            </Link>
          )}
        </div>
      </section>
      <details className={panel}>
        <summary className="cursor-pointer font-semibold">
          Published CMS policy · mapped criteria and boundaries
        </summary>
        <p className="text-sm text-muted-foreground mt-3">
          {cpapPolicy.disclaimer}
        </p>
        <a
          className="block mt-3 text-sm text-primary underline"
          href={cpapPolicy.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Read CMS NCD 240.4, version 3
        </a>
        <p className="mt-2 text-xs text-muted-foreground">
          Effective {cpapPolicy.effectiveDate} · mapping reviewed{" "}
          {cpapPolicy.reviewedDate}. The linked policy is published by CMS; the
          criteria below are our versioned mapping.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{cpapPolicy.scope}</p>
        <ol className="space-y-3 mt-4">
          {cpapPolicy.criteria.map(([id, title, text, reference]) => (
            <li key={id} className="text-sm">
              <strong>{title}:</strong> {text}
              <span className="block text-xs text-muted-foreground mt-1">
                {reference}
              </span>
            </li>
          ))}
        </ol>
      </details>
      {run && (
        <>
          {run.status === "blocked" && (
            <section
              className="rounded-xl border border-amber-400/40 p-5"
              role="status"
            >
              <h2 className="font-semibold text-amber-300">
                Evidence needs human intervention
              </h2>
              <ul className="mt-3 list-disc pl-5 text-sm space-y-1">
                {run.analysis.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">
                No model calls or submission occurred. Correct the source
                documents and run the checks again.
              </p>
            </section>
          )}
          {!run.analysis.blockers.length && !live && (
            <section className={`${panel} space-y-4`}>
              <h2 className="font-semibold text-lg">
                2. Run the live coverage worker
              </h2>
              <p className="text-sm text-muted-foreground">
                Intake consistency → policy-to-evidence review → packet
                completeness. Each specialist receives the full source
                documents, frozen criteria and earlier reviews. All three must
                return valid cited results. Failure leaves human approval
                locked.
              </p>
              <label className="flex gap-3 items-start text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={!!busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I understand that three real model calls and provider retries
                may incur usage charges.
              </label>
              <button
                className={`${button} bg-primary text-primary-foreground`}
                disabled={!!busy || !consent}
                onClick={() => evaluate("live-ai")}
              >
                Run live AI worker <ArrowRight size={16} />
              </button>
            </section>
          )}
          <ProofEvidence
            key={run.id}
            run={run}
            initialFindingId={run.status === "blocked" ? "test-type" : "ahi"}
            showExecution={false}
          />
          <section className={panel}>
            <h2 className="font-semibold text-lg">
              3. Review the exact submission packet
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Extracted fields reflect supplied records and require human
              verification. Model interpretations remain advisory. This packet
              represents administrative preparation, not a payer decision.
            </p>
            <div className="mt-4 rounded-lg border border-amber-400/30 p-4">
              <h3 className="font-semibold text-sm">
                Human checks before handoff
              </h3>
              <ul className="list-disc pl-5 mt-2 space-y-2 text-sm text-muted-foreground">
                {cpapPolicy.humanChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <details className="mt-4" open={false}>
              <summary className="cursor-pointer font-medium text-sm">
                Inspect every extracted packet field, source hash and policy
                reference
              </summary>
              <dl className="mt-4 grid sm:grid-cols-2 gap-3">
                {Object.entries(run.analysis.fields).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg bg-secondary/30 p-3 min-w-0"
                  >
                    <dt className="text-xs text-muted-foreground">{key}</dt>
                    <dd className="mt-1 text-sm break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {run.status === "awaiting-review" && (
              <div className="mt-5 space-y-3 border-t pt-4">
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={inspected}
                    disabled={!live || !!busy}
                    onChange={(e) => setInspected(e.target.checked)}
                  />
                  I inspected the source evidence, specialist notes and exact
                  packet and the remaining human checks.
                </label>
                <label className="block text-sm">
                  Human review note
                  <textarea
                    aria-label="Human review note"
                    className="block w-full rounded-lg border bg-background p-3 mt-2"
                    value={note}
                    disabled={!live || !!busy}
                    maxLength={500}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    className={`${button} bg-primary text-primary-foreground`}
                    disabled={
                      !live || !inspected || note.trim().length < 3 || !!busy
                    }
                    onClick={() => decide("approve")}
                  >
                    Approve sandbox submission
                  </button>
                  <button
                    className={button}
                    disabled={
                      !live || !inspected || note.trim().length < 3 || !!busy
                    }
                    onClick={() => decide("reject")}
                  >
                    Reject packet
                  </button>
                </div>
                {!live && (
                  <p className="text-sm text-amber-300">
                    Three completed live reviews are required before a decision.
                  </p>
                )}
              </div>
            )}
            {run.review && (
              <p className="mt-4 text-sm">
                <strong>Recorded decision:</strong> {run.review.decision} —{" "}
                {run.review.note}
              </p>
            )}
          </section>
          {(run.receipt ||
            run.status === "rejected" ||
            run.status === "delivery-failed" ||
            run.status === "delivering") && (
            <section className={`${panel} space-y-4`}>
              <h2 className="font-semibold text-lg flex gap-2 items-center">
                <ShieldCheck size={20} />
                4. Verify the outcome
              </h2>
              {run.receipt ? (
                <>
                  <p className="text-sm">
                    Saved sandbox receipt:{" "}
                    <span className="font-mono break-all">
                      {run.receipt.id}
                    </span>
                  </p>
                  <button
                    className={button}
                    disabled={!!busy}
                    onClick={() =>
                      act("Rechecking the receiver ledger…", async () => {
                        const receipt = await proofApi<ProofReceipt>(
                          `/runs/${run.id}/receipt`,
                        );
                        if (
                          receipt.fingerprint !== run.analysis.fingerprint ||
                          receipt.id !== run.receipt?.id ||
                          JSON.stringify(receipt.packet) !==
                            JSON.stringify(run.receipt.packet)
                        )
                          throw new Error(
                            "Receiver evidence did not match this packet.",
                          );
                        setVerified(true);
                      })
                    }
                  >
                    Verify receiver receipt
                  </button>
                  {verified && (
                    <p className="text-emerald-400 text-sm flex gap-2">
                      <CheckCircle2 size={16} />
                      Receiver record matches the approved packet.
                    </p>
                  )}
                </>
              ) : run.status === "rejected" ? (
                <p className="text-sm">
                  Rejected by the operator. No submission was attempted.
                </p>
              ) : (
                <>
                  <p className="text-sm text-amber-300">
                    {run.delivery.error ?? "Delivery confirmation is pending."}
                  </p>
                  <button
                    className={button}
                    disabled={!!busy}
                    onClick={() =>
                      act("Retrying the saved approved packet…", async () =>
                        save(
                          await proofApi<ProofRun>(
                            `/runs/${run.id}/deliver`,
                            "POST",
                          ),
                        ),
                      )
                    }
                  >
                    Retry sandbox delivery
                  </button>
                </>
              )}
              <ProofPack run={run} />
              <button
                className={button}
                onClick={() =>
                  downloadProof(run, `cpap-coverage-${run.id}.json`)
                }
              >
                Export evidence JSON
              </button>
              <label className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={disclose}
                  onChange={(e) => setDisclose(e.target.checked)}
                />
                Allow a read-only link to disclose this synthetic case’s source
                quotes, model notes, extracted packet and human review.
              </label>
              <button
                className={button}
                disabled={
                  !!busy ||
                  !disclose ||
                  !["completed", "rejected"].includes(run.status)
                }
                onClick={() =>
                  act("Creating a read-only proof link…", async () => {
                    const result = await proofApi<{ token: string }>(
                      `/runs/${run.id}/shares`,
                      "POST",
                      { confirmDisclosure: true },
                    );
                    setShare(
                      `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/proof/shared#${result.token}`,
                    );
                  })
                }
              >
                Create read-only proof link
              </button>
              {share && (
                <a
                  className="block text-primary text-sm break-all"
                  href={share}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open shared evidence
                </a>
              )}
              <Link
                className="block text-sm text-primary"
                href={`/proof-lab/${run.id}`}
              >
                Open full history and manage share links
              </Link>
            </section>
          )}
          <details className={panel}>
            <summary className="font-semibold cursor-pointer">
              Saved execution timeline · {run.id}
            </summary>
            <ol className="mt-4 space-y-3">
              {run.events.map((e, i) => (
                <li
                  key={i}
                  className="border-l-2 border-primary/40 pl-3 text-sm"
                >
                  <strong>{e.action}</strong>
                  <p className="text-muted-foreground mt-1 break-words">
                    {e.detail}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      <section className={panel}>
        <h2 className="font-semibold text-xl">What a partnership could use</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-4 text-sm">
          <div>
            <h3 className="font-medium">Available in this worker</h3>
            <p className="text-muted-foreground mt-2">
              Bounded evidence intake, versioned rules, cited model review,
              exception handling, saved human decisions, idempotent sandbox
              handoff and exportable proof.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Partner inputs required</h3>
            <p className="text-muted-foreground mt-2">
              Policy applicability and local-rule validation, supported source
              formats, EHR and payer access, clinician oversight, privacy and
              deployment requirements.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Commercial decisions</h3>
            <p className="text-muted-foreground mt-2">
              Agree product ownership or licensing, deployment responsibility,
              pricing, support and incident ownership. These are discussion
              points, not existing commitments.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
