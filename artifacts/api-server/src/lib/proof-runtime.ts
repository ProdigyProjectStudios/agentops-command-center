import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { ProofStore } from "./proof-store";
import { ProofService, httpProofDelivery } from "./proof-service";
import { proofRunsRouter } from "../routes/proof-runs";
import { reviewProofAi } from "./proof-ai";

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
);
export const proofRuntimeRouter = proofRunsRouter(proofService, secret);
