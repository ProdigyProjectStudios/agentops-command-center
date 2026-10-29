/** Standalone, synthetic-only QA preview. Never used by the production entrypoint. */
import express from "express";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { proofTestDatabase } from "./__tests__/helpers/proof-db";
import { ProofStore, migrateProof } from "./lib/proof-store";
import { ProofService, httpProofDelivery } from "./lib/proof-service";
import { proofRunsRouter } from "./routes/proof-runs";
import fixtures from "./routes/proof";

const portArgument = process.argv.indexOf("--port");
const port = Number(
  process.env.PORT ||
    (portArgument >= 0 ? process.argv[portArgument + 1] : 8080),
);
const database = await proofTestDatabase(
  process.env.PROOF_PREVIEW_DATA_DIR || "/tmp/agentops-proof-preview",
);
await migrateProof(database.pool);
const secret = randomBytes(32).toString("hex");
const service = new ProofService(
  new ProofStore(database.pool),
  httpProofDelivery(() => `http://127.0.0.1:${port}/api/proof/sandbox`, secret),
);
const app = express();
app.use(express.json());
app.use("/api", proofRunsRouter(service, secret));
app.use("/api", fixtures);
app.use("/api", (_req, res) =>
  res
    .status(503)
    .json({
      error:
        "Standalone proof preview. The broader application requires its PostgreSQL/Python services.",
    }),
);
const directory = fileURLToPath(
  new URL("../../agentops/dist/public/", import.meta.url),
);
app.use(express.static(directory));
app.get("/{*path}", (_req, res) => res.sendFile(`${directory}/index.html`));
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`Synthetic proof preview listening on ${port}`),
);
async function shutdown() {
  server.close();
  await database.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
