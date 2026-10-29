import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import router from "../routes/proof";
test("proof HTTP contract rejects malformed input and enforces approval blockers", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const url = `http://127.0.0.1:${address.port}/api/proof`;
  const post = (path: string, body: unknown) =>
    fetch(`${url}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (
        (await (await fetch(`${url}/scenarios`)).json()) as {
          scenarios: unknown[];
        }
      ).scenarios.length,
      4,
    );
    assert.equal(
      (await post("review", { scenarioId: "authorization-ready" })).status,
      400,
    );
    assert.equal(
      (await post("evaluate", { scenarioId: "unknown" })).status,
      404,
    );
    assert.equal(
      (
        await post("evaluate", {
          scenarioId: "authorization-ready",
          patientName: "not accepted",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("review", {
          scenarioId: "authorization-missing",
          decision: "approve",
        })
      ).status,
      409,
    );
    const success = await post("review", {
      scenarioId: "authorization-missing",
      decision: "approve",
      documents: ["coverage", "referral", "supporting-note"],
    });
    assert.equal(success.status, 200);
    assert.equal(
      ((await success.json()) as { status: string }).status,
      "sandbox-submitted",
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
