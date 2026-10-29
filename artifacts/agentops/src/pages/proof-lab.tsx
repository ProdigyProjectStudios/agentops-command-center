import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowRight,
  Upload,
  Plus,
  Trash2,
  FlaskConical,
  History,
  FileJson,
  Link2,
  RotateCcw,
} from "lucide-react";
import {
  proofTemplates,
  proofInputSchema,
  type ProofInput,
  type ProofRun,
  type ProofShare,
  type ProofReceipt,
} from "@workspace/api-zod";
import {
  ProofEvidence,
  proofPanel as panel,
  proofButton as button,
  proofDate,
} from "@/components/proof/ProofEvidence";
import { proofApi, downloadProof } from "@/lib/proof-api";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
export default function ProofLabPage() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<ProofInput>(() =>
    structuredClone(proofTemplates[0].input),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [shareConfirmed, setShareConfirmed] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState(false);
  const runQuery = useQuery({
    queryKey: ["proof-run", id],
    queryFn: () => proofApi<ProofRun>(`/runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data?.status === "delivering" ? 3000 : false,
  });
  const runsQuery = useQuery({
    queryKey: ["proof-runs"],
    queryFn: () => proofApi<ProofRun[]>("/runs"),
  });
  const sharesQuery = useQuery({
    queryKey: ["proof-shares", id],
    queryFn: () => proofApi<ProofShare[]>(`/runs/${id}/shares`),
    enabled: !!id && !!runQuery.data,
  });
  const run = runQuery.data;
  async function action(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy("");
    }
  }
  function selectRun(runId: string) {
    setShareUrl("");
    setShareConfirmed(false);
    setNote("");
    setError("");
    setNotice("");
    navigate(`/proof-lab/${runId}`);
  }
  async function saveRun(result: ProofRun) {
    cache.setQueryData(["proof-run", result.id], result);
    await cache.invalidateQueries({ queryKey: ["proof-runs"] });
    selectRun(result.id);
  }
  function editNew() {
    if (run) setDraft(structuredClone(run.input));
    setConfirmed(false);
    setShareUrl("");
    setError("");
    navigate("/proof-lab");
  }
  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    await action("Reading documents…", async () => {
      const docs = await Promise.all(
        Array.from(files).map(async (file) => {
          if (!/\.(txt|md)$/i.test(file.name) || file.size > 16000)
            throw new Error(
              "Use .txt or .md files up to 16 KB. PDF/OCR intake is not included yet.",
            );
          return { name: file.name, text: await file.text() };
        }),
      );
      const existing = draft.documents.filter((d) => d.text.trim());
      if (existing.length + docs.length > 4)
        throw new Error(
          "At most four documents per run. Remove a sample before adding more.",
        );
      setDraft({ ...draft, documents: [...existing, ...docs] });
    });
  }
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="flex items-center gap-2 text-primary text-xs uppercase tracking-[0.18em]">
            <FlaskConical size={15} /> Proof Lab / saved execution
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-3">
            Show the work. Prove the outcome.
          </h1>
          <p className="text-muted-foreground text-sm mt-3 max-w-2xl">
            Documents, cited checks, a human decision and a verified sandbox
            receipt. Every step stays with the run.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={button} onClick={() => setHistory(!history)}>
            <History size={16} /> Saved runs
          </button>
          {id && (
            <button className={`${button} text-primary`} onClick={editNew}>
              <Plus size={16} /> New from this run
            </button>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        Use synthetic documents only. The sandbox records real HTTP submissions
        inside Agent Ops; it does not contact an EHR, payer or bank. Rules mode
        uses no AI. Optional live AI provides cited advisory notes, never
        approval.
      </div>
      {history && (
        <section className={panel}>
          <h2 className="font-semibold mb-3">
            Saved in this browser workspace
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Records live in the database. Access uses a key saved in this
            browser; clearing browser storage loses that access. This is not
            account authentication.
          </p>
          {runsQuery.isPending && <p role="status">Loading saved runs…</p>}
          {runsQuery.isError && (
            <p role="alert">
              Saved runs could not load.{" "}
              <button className="underline" onClick={() => runsQuery.refetch()}>
                Retry
              </button>
            </p>
          )}
          {!runsQuery.isPending &&
            !runsQuery.isError &&
            !runsQuery.data?.length && (
              <p className="text-sm text-muted-foreground">
                No runs yet. Start with a sample below.
              </p>
            )}
          <div className="space-y-2">
            {runsQuery.data?.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRun(r.id)}
                className="flex flex-wrap justify-between gap-2 w-full p-3 rounded-lg border border-border text-left hover:bg-secondary"
              >
                <span className="text-sm">
                  {r.input.title}
                  <span className="block text-xs text-muted-foreground mt-1">
                    {proofDate(r.createdAt)}
                  </span>
                </span>
                <span className="text-xs text-primary">
                  {r.status.replaceAll("-", " ")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {busy && (
        <p role="status" className="text-sm text-primary animate-pulse">
          {busy}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-400">
          {notice}
        </p>
      )}
      {!id ? (
        <>
          <div className="grid md:grid-cols-3 gap-3">
            {proofTemplates.map((t) => (
              <button
                key={t.id}
                disabled={!!busy}
                className={`${panel} text-left hover:border-primary transition-colors`}
                onClick={() => {
                  setDraft(structuredClone(t.input));
                  setConfirmed(false);
                }}
              >
                <p className="font-semibold flex justify-between items-center">
                  {t.title}
                  <ArrowRight size={16} className="text-primary" />
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t.description}
                </p>
              </button>
            ))}
          </div>
          <section className={`${panel} space-y-5`}>
            <div>
              <h2 className="font-semibold text-lg">Prepare the evidence</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Edit the sample or upload text documents using the same Field:
                value format. Remove a required line to demonstrate a blocked
                run.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="text-sm space-y-2">
                <span>Run title</span>
                <input
                  className={field}
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label className="text-sm space-y-2">
                <span>Workflow</span>
                <select
                  className={field}
                  value={draft.workflow}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      workflow: e.target.value as ProofInput["workflow"],
                    })
                  }
                >
                  <option value="vendor-payment">Vendor invoice</option>
                  <option value="authorization">Authorization packet</option>
                  <option value="revenue-cycle">Revenue-cycle packet</option>
                </select>
              </label>
            </div>
            {draft.documents.map((doc, i) => (
              <div key={i} className="space-y-2">
                <div className="flex gap-2 items-center">
                  <label className="flex-1">
                    <span className="sr-only">Document {i + 1} filename</span>
                    <input
                      className={`${field} font-mono`}
                      maxLength={100}
                      value={doc.name}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          documents: draft.documents.map((d, j) =>
                            j === i ? { ...d, name: e.target.value } : d,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    title={`Remove document ${i + 1}`}
                    aria-label={`Remove document ${i + 1}`}
                    className={button}
                    disabled={draft.documents.length === 1}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        documents: draft.documents.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <textarea
                  aria-label={`Document ${i + 1} content`}
                  rows={8}
                  className={`${field} font-mono leading-relaxed`}
                  maxLength={16000}
                  value={doc.text}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      documents: draft.documents.map((d, j) =>
                        j === i ? { ...d, text: e.target.value } : d,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              <label className={`${button} cursor-pointer`}>
                <Upload size={16} /> Upload .txt / .md
                <input
                  className="sr-only"
                  type="file"
                  aria-label="Upload text documents"
                  accept=".txt,.md,text/plain,text/markdown"
                  multiple
                  disabled={!!busy}
                  onChange={(e) => {
                    void readFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className={button}
                disabled={draft.documents.length >= 4 || !!busy}
                onClick={() =>
                  setDraft({
                    ...draft,
                    documents: [
                      ...draft.documents,
                      {
                        name: `evidence-${draft.documents.length + 1}.txt`,
                        text: "",
                      },
                    ],
                  })
                }
              >
                <Plus size={16} /> Add document
              </button>
            </div>
            <label className="text-sm block max-w-md space-y-2">
              <span>Analysis mode</span>
              <select
                className={field}
                value={draft.analysisMode ?? "rules"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    analysisMode: e.target.value as "rules" | "live-ai",
                  })
                }
              >
                <option value="rules">Rules + exact source extraction</option>
                <option value="live-ai">Rules + live AI advisory review</option>
              </select>
              <span className="block text-xs text-muted-foreground">
                Live AI sends extracted evidence to the configured provider and
                records model usage. Missing credentials or invalid citations
                fail explicitly.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>
                These documents contain only synthetic demonstration data, with
                no real patient or confidential business information.
              </span>
            </label>
            <button
              className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
              disabled={!confirmed || !!busy}
              onClick={() =>
                action("Extracting evidence and saving the run…", async () => {
                  const parsed = proofInputSchema.safeParse(draft);
                  if (!parsed.success)
                    throw new Error(
                      "Give the run a title and complete 1–4 non-empty documents.",
                    );
                  await saveRun(
                    await proofApi<ProofRun>("/runs", "POST", parsed.data),
                  );
                })
              }
            >
              Evaluate & save run <ArrowRight size={16} />
            </button>
          </section>
        </>
      ) : runQuery.isPending ? (
        <p role="status">Loading saved evidence…</p>
      ) : runQuery.isError ? (
        <div role="alert" className={panel}>
          {runQuery.error.message}{" "}
          <button className="underline" onClick={() => runQuery.refetch()}>
            Retry
          </button>{" "}
          <Link className="text-primary ml-3" href="/proof-lab">
            New run
          </Link>
        </div>
      ) : run ? (
        <>
          <section
            className={`${panel} flex flex-wrap justify-between items-center gap-4`}
          >
            <div>
              <p className="text-xs uppercase tracking-wider text-primary">
                {run.status.replaceAll("-", " ")}
              </p>
              <h2 className="text-xl font-semibold mt-2">{run.input.title}</h2>
              <p className="text-xs text-muted-foreground mt-2">
                Saved {proofDate(run.createdAt)}
              </p>
            </div>
            <button
              className={button}
              disabled={!!busy}
              onClick={() =>
                action("Preparing export…", async () =>
                  downloadProof(
                    await proofApi(`/runs/${run.id}/export`),
                    `agentops-proof-${run.id}.json`,
                  ),
                )
              }
            >
              <FileJson size={16} /> Export evidence
            </button>
          </section>
          <ProofEvidence key={run.id} run={run} />
          {run.status === "blocked" && (
            <section className={`${panel} border-amber-500/30`}>
              <h2 className="font-semibold text-amber-400">
                Correct the evidence before approval
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {run.analysis.summary} This run remains unchanged for
                inspection.
              </p>
              <button className={`${button} mt-4`} onClick={editNew}>
                Correct inputs in a new run
              </button>
            </section>
          )}
          {run.status === "awaiting-review" && (
            <section className={`${panel} space-y-4`}>
              <h2 className="font-semibold">
                Your decision controls delivery.
              </h2>
              <p className="text-sm text-muted-foreground">
                Inspect the source lines above. Approval submits this exact
                packet to the Agent Ops sandbox over HTTP.
              </p>
              <label className="block text-sm space-y-2">
                <span>Review note</span>
                <textarea
                  className={field}
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Explain what you checked and why you approve or reject."
                />
              </label>
              <div className="flex gap-3 flex-wrap">
                {(["approve", "reject"] as const).map((decision) => (
                  <button
                    key={decision}
                    disabled={!!busy || note.trim().length < 3}
                    className={`${button} ${decision === "approve" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                    onClick={() =>
                      action(
                        decision === "approve"
                          ? "Recording approval, submitting and verifying receipt…"
                          : "Recording rejection…",
                        async () =>
                          saveRun(
                            await proofApi<ProofRun>(
                              `/runs/${run.id}/review`,
                              "POST",
                              {
                                decision,
                                note,
                                fingerprint: run.analysis.fingerprint,
                              },
                            ),
                          ),
                      )
                    }
                  >
                    {decision === "approve"
                      ? "Approve & deliver to sandbox"
                      : "Reject packet"}
                  </button>
                ))}
              </div>
            </section>
          )}
          {(run.status === "delivery-failed" ||
            run.status === "delivering") && (
            <section className={panel}>
              <p className="text-sm mb-3">
                {run.status === "delivering"
                  ? "Delivery is in progress. If interrupted, retry becomes available after 30 seconds."
                  : (run.delivery.error ??
                    "Approved. Delivery is waiting to be resumed.")}
              </p>
              <button
                className={button}
                disabled={
                  !!busy ||
                  (run.status === "delivering" &&
                    Date.now() -
                      Date.parse(run.delivery.lastAttemptAt ?? run.updatedAt) <
                      30000)
                }
                onClick={() =>
                  action("Retrying the same approved packet…", async () =>
                    saveRun(
                      await proofApi<ProofRun>(`/runs/${run.id}/retry`, "POST"),
                    ),
                  )
                }
              >
                <RotateCcw size={16} /> Retry delivery
              </button>
            </section>
          )}
          {run.receipt && (
            <button
              className={button}
              disabled={!!busy}
              onClick={() =>
                action("Checking receiver ledger…", async () => {
                  const receipt = await proofApi<ProofReceipt>(
                    `/runs/${run.id}/receipt`,
                  );
                  if (
                    receipt.id !== run.receipt?.id ||
                    receipt.fingerprint !== run.analysis.fingerprint
                  )
                    throw new Error("Ledger receipt differs from this run.");
                  setNotice(`Receiver ledger confirms ${receipt.id}.`);
                })
              }
            >
              Verify receipt in receiver ledger
            </button>
          )}
          {["completed", "blocked", "rejected"].includes(run.status) && (
            <section className={`${panel} space-y-4`}>
              <h2 className="font-semibold flex items-center gap-2">
                <Link2 size={17} className="text-primary" /> Share inspectable
                proof
              </h2>
              <p className="text-sm text-muted-foreground">
                Create a read-only snapshot that expires in seven days. It
                includes extracted fields, cited source lines, review notes and
                the receipt. Full document text and your browser workspace key
                are excluded.
              </p>
              <label className="flex gap-3 items-start text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={shareConfirmed}
                  onChange={(e) => setShareConfirmed(e.target.checked)}
                />
                <span>
                  I have reviewed these contents and want anyone holding the
                  link to be able to inspect this snapshot.
                </span>
              </label>
              <button
                className={button}
                disabled={!shareConfirmed || !!busy}
                onClick={() =>
                  action("Creating proof link…", async () => {
                    const result = await proofApi<{
                      token: string;
                      expiresAt: string;
                    }>(`/runs/${run.id}/shares`, "POST", {
                      confirmDisclosure: true,
                    });
                    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                    setShareUrl(
                      `${location.origin}${base}/proof/shared#${result.token}`,
                    );
                    await sharesQuery.refetch();
                  })
                }
              >
                Create read-only link
              </button>
              {shareUrl && (
                <div className="space-y-2">
                  <label className="text-sm">
                    New proof link
                    <input
                      readOnly
                      aria-label="Read-only proof link"
                      className={`${field} mt-2`}
                      value={shareUrl}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <a
                    href={shareUrl}
                    className="inline-block text-sm text-primary"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview shared proof ↗
                  </a>
                </div>
              )}
              {sharesQuery.isError && (
                <p role="alert" className="text-sm">
                  Could not load existing shares.{" "}
                  <button
                    className="underline"
                    onClick={() => sharesQuery.refetch()}
                  >
                    Retry
                  </button>
                </p>
              )}
              <div className="space-y-2">
                {sharesQuery.data?.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      Created {proofDate(s.createdAt)} ·{" "}
                      {s.revokedAt
                        ? "Revoked"
                        : new Date(s.expiresAt).getTime() <= Date.now()
                          ? "Expired"
                          : `Expires ${proofDate(s.expiresAt)}`}
                    </p>
                    {!s.revokedAt && (
                      <button
                        className={`${button} py-1.5`}
                        disabled={!!busy}
                        onClick={() =>
                          action("Revoking link…", async () => {
                            await proofApi(
                              `/runs/${run.id}/shares/${s.id}`,
                              "DELETE",
                            );
                            setShareUrl("");
                            await sharesQuery.refetch();
                          })
                        }
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
      <div className="flex flex-wrap gap-5 text-sm text-primary">
        <Link href="/requests/new">Existing multi-agent workflows →</Link>
        <Link href="/proof-lab/fixtures">
          Original healthcare rule fixtures →
        </Link>
        <Link href="/architecture">System architecture →</Link>
      </div>
    </div>
  );
}
