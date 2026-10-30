import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { z } from "zod";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Circle,
  RotateCcw,
  Presentation,
  FileText,
  ShieldCheck,
  Link2,
  FileJson,
  ExternalLink,
} from "lucide-react";
import {
  healthcareDemos,
  healthcareDemoInput,
  healthcareDemoSteps,
  type HealthcareDemo,
  type ProofRun,
  type ProofReceipt,
} from "@workspace/api-zod";
import {
  ProofEvidence,
  proofPanel as panel,
  proofButton as button,
} from "@/components/proof/ProofEvidence";
import { OriginalGraphEvidence } from "@/components/proof/OriginalGraph";
import { proofApi, downloadProof } from "@/lib/proof-api";

const sessionSchema = z
  .object({
    version: z.literal(2),
    workflow: z.enum(["authorization", "revenue-cycle"]),
    step: z.number().int().min(0).max(6),
    blockedId: z.string().uuid().optional(),
    readyId: z.string().uuid().optional(),
    verifiedId: z.string().uuid().optional(),
  })
  .strict();
type Session = z.infer<typeof sessionSchema>;
const storageKey = "agentops-healthcare-walkthrough-v2";
const fresh = (workflow: HealthcareDemo = "authorization"): Session => ({
  version: 2,
  workflow,
  step: 0,
});
const inputClass =
  "w-full rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
function restore(): Session {
  try {
    return sessionSchema.parse(
      JSON.parse(sessionStorage.getItem(storageKey) ?? "null"),
    );
  } catch {
    return fresh();
  }
}

export default function HealthcareDemoPage() {
  const [session, setSession] = useState<Session>(restore);
  const [busy, setBusy] = useState("");
  const running = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [presenter, setPresenter] = useState(false);
  const [intervened, setIntervened] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [disclose, setDisclose] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const cache = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
      setStorageNotice(
        "This browser cannot remember walkthrough progress. Saved runs remain available in the Proof Lab.",
      );
    }
  }, [session]);
  const blockedQuery = useQuery({
    queryKey: ["proof-run", session.blockedId],
    queryFn: () => proofApi<ProofRun>(`/runs/${session.blockedId}`),
    enabled: !!session.blockedId,
    retry: false,
  });
  const readyQuery = useQuery({
    queryKey: ["proof-run", session.readyId],
    queryFn: () => proofApi<ProofRun>(`/runs/${session.readyId}`),
    enabled: !!session.readyId,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.status === "delivering" ||
      q.state.data?.graph?.state === "running"
        ? 3000
        : false,
  });
  const health = useQuery({
    queryKey: ["proof-demo-ready"],
    queryFn: () => proofApi<ProofRun[]>("/runs"),
    retry: false,
  });
  const blocked = blockedQuery.data,
    ready = readyQuery.data;
  useEffect(() => {
    if (ready && ready.input.workflow !== "vendor-payment")
      setReviewNote(
        ready.review?.note ?? healthcareDemos[ready.input.workflow].reviewNote,
      );
  }, [ready?.id, ready?.review?.note]);
  const verified =
    ready?.status === "completed" && session.verifiedId === ready.id;
  const finished =
    verified ||
    (ready?.status === "rejected" &&
      (!ready.graph || ready.graph.finalization?.state === "completed"));
  const maxStep = finished
    ? 6
    : ready
      ? ready.status === "awaiting-review"
        ? ready.graph?.state === "ready"
          ? 4
          : 3
        : 5
      : blocked?.status === "blocked"
        ? 2
        : 1;
  const step = Math.min(session.step, maxStep);
  const config = healthcareDemos[session.workflow];
  const loadingRun =
    (!!session.blockedId && blockedQuery.isPending) ||
    (!!session.readyId && readyQuery.isPending);
  const restoreError = blockedQuery.isError || readyQuery.isError;
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function go(next: number) {
    setError("");
    setNotice("");
    setSession((s) => ({ ...s, step: Math.min(next, maxStep) }));
  }
  function reset(workflow = session.workflow) {
    setSession(fresh(workflow));
    setIntervened(false);
    setReviewNote("");
    setDisclose(false);
    setShareUrl("");
    setError("");
    setNotice("");
  }
  async function act(label: string, execute: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await execute();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The action failed. Retry or open the saved run.",
      );
    } finally {
      running.current = false;
      setBusy("");
    }
  }
  function remember(run: ProofRun) {
    cache.setQueryData(["proof-run", run.id], run);
    void cache.invalidateQueries({ queryKey: ["proof-runs"] });
  }
  async function evaluate(repaired: boolean) {
    const run = await proofApi<ProofRun>(
      "/runs",
      "POST",
      healthcareDemoInput(session.workflow, repaired),
    );
    remember(run);
    if (run.status !== (repaired ? "awaiting-review" : "blocked"))
      throw new Error(
        "The server returned an unexpected policy result. Inspect this run in the Proof Lab before continuing.",
      );
    setSession((s) =>
      repaired
        ? { ...s, readyId: run.id, verifiedId: undefined, step: 3 }
        : { ...s, blockedId: run.id, step: 2 },
    );
    if (repaired) setReviewNote(config.reviewNote);
  }
  async function review(decision: "approve" | "reject") {
    if (!ready) return;
    const run = await proofApi<ProofRun>(`/runs/${ready.id}/review`, "POST", {
      decision,
      note: reviewNote,
      fingerprint: ready.analysis.fingerprint,
      graphFingerprint: ready.graph?.fingerprint,
    });
    remember(run);
    setSession((s) => ({ ...s, step: 5, verifiedId: undefined }));
  }
  async function verifyReceipt() {
    if (!ready?.receipt) return;
    const receipt = await proofApi<ProofReceipt>(`/runs/${ready.id}/receipt`);
    if (
      receipt.id !== ready.receipt.id ||
      receipt.runId !== ready.id ||
      receipt.fingerprint !== ready.analysis.fingerprint ||
      (!!ready.graph &&
        (receipt.graph?.fingerprint !== ready.graph.fingerprint ||
          receipt.graph?.workflowRunId !== ready.graph.workflowRunId))
    )
      throw new Error(
        "The receiver record did not match this run. Stop and inspect it in the Proof Lab.",
      );
    setSession((s) => ({ ...s, verifiedId: ready.id }));
    setNotice(
      "Receiver record verified against this run’s receipt and input fingerprint.",
    );
  }
  const current = step === 2 ? blocked : ready;
  const responsibility = [
    "Choose the scenario",
    "Automatic source checks",
    "Human correction",
    "Automatic agent execution",
    "Human approval",
    "Receiver verification",
    "Partnership discussion",
  ][step];
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          href="/overview"
          className="text-muted-foreground hover:text-primary inline-flex items-center gap-2"
        >
          <ArrowLeft size={14} /> Product overview
        </Link>
        <Link
          href="/proof-lab"
          className="text-muted-foreground hover:text-primary"
        >
          Explore Proof Lab ↗
        </Link>
      </div>
      <header className="surface-hero p-6 md:p-8 flex flex-wrap justify-between items-start gap-5">
        <div>
          <p className="text-primary text-xs uppercase tracking-[0.18em] flex gap-2 items-center">
            <Presentation size={16} /> Healthcare partner walkthrough
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-3">
            From an exception to an accountable action.
          </h1>
          <p className="text-muted-foreground text-sm mt-3 max-w-2xl">
            Follow one synthetic case from source documents through agent
            execution, a human decision and a receipt you can independently
            check.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            aria-pressed={presenter}
            onClick={() => setPresenter(!presenter)}
          >
            Presenter notes {presenter ? "on" : "off"}
          </button>
          <button className={button} disabled={!!busy} onClick={() => reset()}>
            <RotateCcw size={15} /> Start fresh
          </button>
        </div>
      </header>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="text-primary">
          Synthetic cases · demo graph · zero model calls · first-party sandbox
        </span>
        <span>
          {health.isSuccess
            ? "Proof API reachable"
            : health.isError
              ? "Proof API unavailable"
              : "Checking proof API…"}
        </span>
        {session.blockedId && (
          <span>Progress resumes in this tab · saved runs retained</span>
        )}
      </div>
      {storageNotice && (
        <p role="status" className="text-xs text-amber-400">
          {storageNotice}
        </p>
      )}
      <nav
        aria-label="Demo steps"
        className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2"
      >
        {healthcareDemoSteps.map((s, i) => (
          <button
            key={s.title}
            disabled={!!busy || i > maxStep || loadingRun || restoreError}
            onClick={() => go(i)}
            aria-current={step === i ? "step" : undefined}
            className={`rounded-xl border p-3 text-left disabled:opacity-40 ${step === i ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary"}`}
          >
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {i < step ? (
                <CheckCircle2 size={14} className="text-primary" />
              ) : (
                <Circle size={14} />
              )}{" "}
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="block text-sm font-medium mt-2">{s.title}</span>
          </button>
        ))}
      </nav>
      {busy && (
        <p role="status" className="text-primary text-sm animate-pulse">
          {busy}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="border border-destructive/40 rounded-lg p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-400">
          {notice}
        </p>
      )}
      {loadingRun ? (
        <p role="status">Restoring saved run evidence…</p>
      ) : restoreError ? (
        <section className={panel}>
          <h2 className="font-semibold">
            Saved evidence could not be restored
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            The API may be unavailable, or this browser may no longer have its
            original workspace key. No completed step is being assumed.
          </p>
          <button
            className={`${button} mt-4`}
            onClick={() => {
              void blockedQuery.refetch();
              void readyQuery.refetch();
            }}
          >
            Retry saved runs
          </button>
          <button className={`${button} ml-2`} onClick={() => reset()}>
            Start a new walkthrough
          </button>
        </section>
      ) : (
        <>
          <div>
            <p className="text-primary text-xs uppercase tracking-wider">
              Step {step + 1} of {healthcareDemoSteps.length} · {responsibility}
            </p>
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-2xl font-semibold mt-2 outline-none"
            >
              {healthcareDemoSteps[step].question}
            </h2>
          </div>
          {presenter && (
            <aside className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">
                Presenter cue
              </p>
              <p className="text-sm mt-2 text-muted-foreground">
                {healthcareDemoSteps[step].notes}
              </p>
            </aside>
          )}
          {step === 0 && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                {(Object.keys(healthcareDemos) as HealthcareDemo[]).map(
                  (workflow) => (
                    <button
                      key={workflow}
                      className={`${panel} text-left ${session.workflow === workflow ? "border-primary" : "hover:border-primary/50"}`}
                      aria-pressed={session.workflow === workflow}
                      onClick={() => reset(workflow)}
                    >
                      <p className="font-semibold flex justify-between">
                        {healthcareDemos[workflow].title}
                        <ArrowRight size={17} className="text-primary" />
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {healthcareDemos[workflow].description}
                      </p>
                    </button>
                  ),
                )}
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  [
                    "Working now",
                    "Source citations, a real seven-node demo graph, recorded review, HTTP sandbox delivery and shareable evidence.",
                  ],
                  [
                    "Human responsibility",
                    "Supply or reconcile missing evidence, check the decision, and explicitly approve or reject the packet.",
                  ],
                  [
                    "Integration readiness",
                    "Real policy validation, document formats, EHR/payer access, identity controls, data handling and operational support.",
                  ],
                ].map(([title, text]) => (
                  <section key={title} className={panel}>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{text}</p>
                  </section>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                This walkthrough executes administrative rules and the original
                agent graph with preset demo outputs. It makes no model calls.
                Live AI can be tested separately in Proof Lab with configured
                credentials. The receiver is our sandbox; no payer or EHR is
                contacted.
              </p>
              <button
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                onClick={() => go(1)}
              >
                Begin{" "}
                {session.workflow === "authorization"
                  ? "authorization"
                  : "revenue-cycle"}{" "}
                walkthrough <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <section className={`${panel} space-y-4`}>
                <h3 className="font-semibold">
                  Start with an imperfect packet
                </h3>
                <p className="text-sm text-muted-foreground">
                  {config.problem} The sample below is the actual input sent to
                  the server.
                </p>
                <div className="grid md:grid-cols-2 gap-3">
                  {healthcareDemoInput(session.workflow, false).documents.map(
                    (doc) => (
                      <div
                        key={doc.name}
                        className="rounded-lg border border-border bg-background p-4"
                      >
                        <p className="text-xs text-primary flex gap-2 items-center">
                          <FileText size={14} />
                          {doc.name}
                        </p>
                        <pre className="text-sm font-mono mt-3 whitespace-pre-wrap break-words">
                          {doc.text}
                        </pre>
                      </div>
                    ),
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  All references are synthetic. “Coverage: active” is supplied
                  test data, not an eligibility lookup.
                </p>
              </section>
              {blocked ? (
                <button className={button} onClick={() => go(2)}>
                  Open the saved exception <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                  disabled={!!busy || !health.isSuccess}
                  onClick={() =>
                    act("Running checks and saving the exception…", () =>
                      evaluate(false),
                    )
                  }
                >
                  Run evidence checks <ArrowRight size={16} />
                </button>
              )}
              {health.isError && (
                <button className={button} onClick={() => health.refetch()}>
                  Retry API connection
                </button>
              )}
            </>
          )}
          {step === 2 && blocked && (
            <>
              <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-4">
                <p className="text-amber-400 font-medium">
                  Submission blocked by the server
                </p>
                <p className="text-sm mt-2 text-muted-foreground">
                  {blocked.analysis.summary} No approval or receipt exists for
                  this run.
                </p>
              </div>
              <ProofEvidence
                key={blocked.id}
                run={blocked}
                initialFindingId={config.findingId}
                showExecution={false}
              />
              <section className={`${panel} space-y-4`}>
                <h3 className="font-semibold">
                  Human intervention: {config.intervention.toLowerCase()}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {config.changed}
                </p>
                {ready ? (
                  <button className={button} onClick={() => go(3)}>
                    Open the corrected run <ArrowRight size={16} />
                  </button>
                ) : (
                  <>
                    <label className="text-sm flex gap-3 items-start">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={intervened}
                        onChange={(e) => setIntervened(e.target.checked)}
                      />
                      <span>{config.confirmation}</span>
                    </label>
                    <button
                      className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                      disabled={!!busy || !intervened}
                      onClick={() =>
                        act("Saving corrected evidence as a new run…", () =>
                          evaluate(true),
                        )
                      }
                    >
                      Re-evaluate corrected packet <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </section>
            </>
          )}
          {step === 3 && ready && (
            <>
              <section className={`${panel} space-y-4`}>
                <p className="text-xs uppercase tracking-wider text-primary">
                  Automatic · inspectable · no model charges
                </p>
                <h3 className="font-semibold">
                  Run the agents on the corrected packet
                </h3>
                <p className="text-sm text-muted-foreground">
                  The original engine runs triage, knowledge lookup, legal,
                  finance, communications, synthesis and the approval gate. It
                  saves each node’s output before handing control back to you.
                </p>
                <p className="text-sm text-muted-foreground">
                  Demo narratives are preset illustrations; the source checks
                  govern this packet. Knowledge lookup is real keyword
                  retrieval. Other recorded graph tools are simulations.
                </p>
                {ready.graph?.state !== "ready" &&
                  ready.status === "awaiting-review" && (
                    <button
                      className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                      disabled={!!busy}
                      onClick={() =>
                        act(
                          "Executing the seven-node demo graph and saving its outputs…",
                          async () => {
                            const result = await proofApi<ProofRun>(
                              `/runs/${ready.id}/graph`,
                              "POST",
                              { mode: "demo" },
                            );
                            remember(result);
                            if (result.graph?.state === "ready")
                              setNotice(
                                "Seven agent nodes saved. Inspect their outputs, then continue to human review.",
                              );
                          },
                        )
                      }
                    >
                      {ready.graph
                        ? "Resume demo agent execution"
                        : "Run demo agent execution"}{" "}
                      <ArrowRight size={16} />
                    </button>
                  )}
                <p className="text-xs text-muted-foreground">
                  An interrupted run resumes from saved nodes. Approval stays
                  locked until execution completes.
                </p>
              </section>
              <OriginalGraphEvidence run={ready} />
              <button
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                disabled={!!busy || ready.graph?.state !== "ready"}
                onClick={() => go(4)}
              >
                Continue to human review <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === 4 && ready && (
            <>
              <div
                className={`${panel} flex flex-wrap items-center justify-between gap-4`}
              >
                <div>
                  <p className="font-medium">
                    The corrected evidence is a separate, saved run.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {config.changed}
                  </p>
                </div>
                <Link
                  className="text-primary text-sm"
                  href={`/proof-lab/${blocked?.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect original blocked run ↗
                </Link>
              </div>
              <ProofEvidence
                key={ready.id}
                run={ready}
                initialFindingId={config.findingId}
                showExecution={false}
              />
              {ready.status === "awaiting-review" ? (
                <section className={`${panel} space-y-4`}>
                  <h3 className="font-semibold">Make the human decision</h3>
                  <p className="text-sm text-muted-foreground">
                    Inspect the saved agent outputs and source lines, then
                    review the note. Your decision binds this packet and its
                    graph fingerprint. Approval submits to the first-party
                    sandbox; rejection records the decision without delivery.
                  </p>
                  <label className="block text-sm space-y-2">
                    <span>Operator review note</span>
                    <textarea
                      className={inputClass}
                      rows={3}
                      maxLength={500}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                      disabled={
                        !!busy ||
                        reviewNote.trim().length < 3 ||
                        ready.graph?.state !== "ready"
                      }
                      onClick={() =>
                        act(
                          "Recording approval and verifying sandbox delivery…",
                          () => review("approve"),
                        )
                      }
                    >
                      Approve & submit to sandbox <ArrowRight size={16} />
                    </button>
                    <button
                      className={button}
                      disabled={
                        !!busy ||
                        reviewNote.trim().length < 3 ||
                        ready.graph?.state !== "ready"
                      }
                      onClick={() =>
                        act("Recording rejection without delivery…", () =>
                          review("reject"),
                        )
                      }
                    >
                      Reject without delivery
                    </button>
                  </div>
                </section>
              ) : (
                <button className={button} onClick={() => go(5)}>
                  View the recorded outcome <ArrowRight size={16} />
                </button>
              )}
            </>
          )}
          {step === 5 && ready && (
            <>
              <ProofEvidence
                key={ready.id}
                run={ready}
                initialFindingId={config.findingId}
              />
              {ready.status === "completed" ? (
                <section className={`${panel} space-y-4`}>
                  <h3 className="font-semibold flex items-center gap-2">
                    <ShieldCheck size={18} className="text-primary" /> Verify it
                    while they watch
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Read the receiver ledger again and compare it with the
                    stored run. This is a new server request, not a visual
                    replay.
                  </p>
                  <button
                    className={button}
                    disabled={!!busy}
                    onClick={() =>
                      act(
                        "Retrieving the receiver ledger record…",
                        verifyReceipt,
                      )
                    }
                  >
                    {verified ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}{" "}
                    {verified
                      ? "Verify receipt again"
                      : "Verify receiver receipt"}
                  </button>
                  {verified && (
                    <p className="text-sm text-emerald-400">
                      Receipt verified during this walkthrough.
                    </p>
                  )}
                </section>
              ) : ready.status === "rejected" ? (
                <section className={panel}>
                  <h3 className="font-semibold">
                    The operator rejected the packet.
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    The decision is saved and no receipt was created. Start a
                    fresh walkthrough to demonstrate an approved path.
                  </p>
                  {ready.graph &&
                    ready.graph.finalization?.state !== "completed" && (
                      <button
                        className={`${button} mt-3`}
                        disabled={!!busy}
                        onClick={() =>
                          act("Finalizing the saved rejection…", async () =>
                            remember(
                              await proofApi<ProofRun>(
                                `/runs/${ready.id}/graph/finalize`,
                                "POST",
                              ),
                            ),
                          )
                        }
                      >
                        Retry graph finalization
                      </button>
                    )}
                </section>
              ) : (
                <section className={`${panel} space-y-3`}>
                  <h3 className="font-semibold">Delivery needs attention</h3>
                  <p className="text-sm text-muted-foreground">
                    {ready.delivery.error ??
                      "The attempt is running. If interrupted, a retry becomes available after 30 seconds."}
                  </p>
                  <button
                    className={button}
                    disabled={
                      !!busy ||
                      (ready.status === "delivering" &&
                        Date.now() -
                          Date.parse(
                            ready.delivery.lastAttemptAt ?? ready.updatedAt,
                          ) <
                          30000)
                    }
                    onClick={() =>
                      act(
                        "Retrying the approved packet with the same run ID…",
                        async () =>
                          remember(
                            await proofApi<ProofRun>(
                              `/runs/${ready.id}/retry`,
                              "POST",
                            ),
                          ),
                      )
                    }
                  >
                    Retry delivery
                  </button>
                </section>
              )}
              <section className={`${panel} space-y-4`}>
                <h3 className="font-semibold">
                  Give them evidence they can revisit
                </h3>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className={button}
                    href={`/proof-lab/${ready.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={15} /> Full saved run
                  </Link>
                  <button
                    className={button}
                    disabled={!!busy}
                    onClick={() =>
                      act("Preparing evidence export…", async () =>
                        downloadProof(
                          await proofApi(`/runs/${ready.id}/export`),
                          `healthcare-demo-${ready.id}.json`,
                        ),
                      )
                    }
                  >
                    <FileJson size={15} /> Export run evidence
                  </button>
                </div>
                {["completed", "rejected"].includes(ready.status) && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      A proof link includes cited quotes, extracted fields,
                      review notes and any receipt. Anyone with the link can
                      read it for seven days. Manage or revoke it from the full
                      saved run.
                    </p>
                    <label className="text-sm flex items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={disclose}
                        onChange={(e) => setDisclose(e.target.checked)}
                      />
                      <span>
                        I have reviewed the synthetic evidence and approve
                        sharing this snapshot.
                      </span>
                    </label>
                    <button
                      className={button}
                      disabled={!!busy || !disclose}
                      onClick={() =>
                        act("Creating a read-only evidence link…", async () => {
                          const share = await proofApi<{ token: string }>(
                            `/runs/${ready.id}/shares`,
                            "POST",
                            { confirmDisclosure: true },
                          );
                          setShareUrl(
                            `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/proof/shared#${share.token}`,
                          );
                        })
                      }
                    >
                      <Link2 size={15} /> Create proof link
                    </button>
                    {shareUrl && (
                      <div>
                        <label className="text-sm">
                          Read-only proof link
                          <input
                            className={`${inputClass} mt-2`}
                            value={shareUrl}
                            readOnly
                            onFocus={(e) => e.target.select()}
                          />
                        </label>
                        <a
                          className="inline-block text-primary text-sm mt-2"
                          href={shareUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open viewer page ↗
                        </a>
                      </div>
                    )}
                  </>
                )}
              </section>
              <button
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                disabled={!finished || !!busy}
                onClick={() => go(6)}
              >
                Discuss the partnership <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === 6 && ready && (
            <>
              <section className={panel}>
                <h3 className="font-semibold">
                  What this session demonstrated
                </h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  {[
                    [
                      "Exception retained",
                      blocked?.status === "blocked"
                        ? "Original blocked run saved"
                        : "Not demonstrated",
                    ],
                    [
                      "Agent execution",
                      ready.graph?.state === "ready"
                        ? "Seven original nodes saved; demo outputs labelled"
                        : "Not demonstrated",
                    ],
                    [
                      "Human decision",
                      ready.review?.decision === "approve"
                        ? "Explicit approval recorded"
                        : "Explicit rejection recorded",
                    ],
                    [
                      "Delivery proof",
                      verified
                        ? "Sandbox receipt independently rechecked"
                        : "No submission: packet rejected",
                    ],
                  ].map(([title, detail]) => (
                    <div key={title}>
                      <p className="text-xs uppercase tracking-wider text-primary">
                        {title}
                      </p>
                      <p className="text-sm mt-2">{detail}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className={`${panel} space-y-4`}>
                <h3 className="font-semibold">Assess partnership fit</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 pr-5">Decision</th>
                        <th className="py-3">Agree together</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [
                          "Existing capability fit",
                          "Which demonstrated capability fits an existing partner solution, and which capabilities must already be operational?",
                        ],
                        [
                          "Integration access",
                          "Required EHR/payer or work-queue connections; distinguish working adapters from gaps before agreeing scope.",
                        ],
                        [
                          "Human ownership",
                          "Who resolves exceptions, approves actions and handles escalations.",
                        ],
                        [
                          "Success measures",
                          "Correct decisions, traceable evidence, intervention rate, handling time and failed-action recovery—measured in the pilot.",
                        ],
                        [
                          "Delivery & support",
                          "Delivery responsibilities, operating hours, incident ownership and ongoing support scope; pilot milestones only if a fit is established.",
                        ],
                        [
                          "Commercial & IP",
                          "Pricing, ownership/licensing, permitted reuse and partnership responsibilities. No terms are assumed.",
                        ],
                      ].map(([topic, text]) => (
                        <tr key={topic} className="border-b border-border/60">
                          <th className="py-3 pr-5 font-medium align-top whitespace-nowrap">
                            {topic}
                          </th>
                          <td className="py-3 text-muted-foreground">{text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground">
                  Before real healthcare data: validate policies with the
                  partner and establish authentication, access isolation, data
                  handling and deployment controls. This demo does not establish
                  compliance or a production integration.
                </p>
              </section>
              <div className="flex flex-wrap gap-3">
                <button
                  className={button}
                  onClick={() =>
                    reset(
                      session.workflow === "authorization"
                        ? "revenue-cycle"
                        : "authorization",
                    )
                  }
                >
                  Demonstrate{" "}
                  {session.workflow === "authorization"
                    ? "revenue-cycle"
                    : "authorization"}{" "}
                  next <ArrowRight size={16} />
                </button>
                <button
                  className={button}
                  onClick={() =>
                    downloadProof(
                      {
                        generatedAt: new Date().toISOString(),
                        workflow: session.workflow,
                        mode: "synthetic-rules-first-party-sandbox",
                        blockedRunId: blocked?.id,
                        reviewedRunId: ready.id,
                        operatorDecision: ready.review?.decision,
                        receiptId: ready.receipt?.id ?? null,
                        verifiedDuringWalkthrough: verified,
                        nextDecisions: [
                          "workflow and policy owner",
                          "integration access",
                          "approval owner",
                          "measured acceptance criteria",
                          "delivery and support",
                          "commercial and IP terms",
                        ],
                      },
                      `healthcare-walkthrough-${ready.id}.json`,
                    )
                  }
                >
                  <FileJson size={15} /> Download session summary
                </button>
              </div>
            </>
          )}
          <footer className="border-t border-border pt-4 flex flex-wrap justify-between gap-3 items-center text-sm">
            {step > 0 ? (
              <button
                className={button}
                disabled={!!busy}
                onClick={() => go(step - 1)}
              >
                <ArrowLeft size={15} /> Previous step
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Starting fresh resets the walkthrough only; saved evidence and
                existing share links remain.
              </span>
            )}
            <div className="flex flex-wrap gap-4">
              <Link className="text-primary" href="/proof-lab">
                Open Proof Lab →
              </Link>
              {current && (
                <Link
                  className="text-primary"
                  href={`/proof-lab/${current.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect this run →
                </Link>
              )}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
