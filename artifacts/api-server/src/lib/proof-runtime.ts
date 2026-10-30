import { GithubProofHandoff } from "./proof-github";
import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { ProofStore } from "./proof-store";
import { ProofService, httpProofDelivery } from "./proof-service";
import { proofRunsRouter } from "../routes/proof-runs";
import { reviewProofAi } from "./proof-ai";
import { originalProofGraph } from "./proof-graph-runtime";

// First-party sandbox only: no caller-controlled URL and no external recipients.
// Per-process secret works across the loopback HTTP calls, never sent to a browser.
const secret = randomBytes(32).toString("hex");
export const proofStore = new ProofStore(pool);
export const proofService = new ProofService(
  proofStore,
  httpProofDelivery(
    () => `http://127.0.0.1:${Number(process.env.PORT)}/api/proof/sandbox`,
    secret,
  ),
  reviewProofAi,
  originalProofGraph,
);
const integration =
  process.env.PROOF_GITHUB_REPOSITORY &&
  process.env.PROOF_GITHUB_TOKEN &&
  (process.env.PROOF_INTEGRATION_KEY?.length ?? 0) >= 32
    ? {
        handoff: new GithubProofHandoff(proofStore, {
          repository: process.env.PROOF_GITHUB_REPOSITORY,
          token: process.env.PROOF_GITHUB_TOKEN,
        }),
        operatorKey: process.env.PROOF_INTEGRATION_KEY!,
      }
    : undefined;
export const proofRuntimeRouter = proofRunsRouter(
  proofService,
  secret,
  integration,
  process.env.PROOF_INTEGRATION_KEY,
);
