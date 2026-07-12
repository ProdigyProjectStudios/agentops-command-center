import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const WORKER_BASE_URL =
  process.env["WORKER_BASE_URL"]?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";
const WORKER_TIMEOUT_MS = Number(
  process.env["WORKER_TIMEOUT_MS"] ?? "15000",
);

type WorkerProxyError = {
  error: "worker_unreachable";
};

export const PROXY_ERROR_BODY: WorkerProxyError = { error: "worker_unreachable" };

export async function callWorker(
  path: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  try {
    const res = await fetch(`${WORKER_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

router.get("/worker/health", async (_req, res) => {
  try {
    const result = await callWorker("/worker/health", { method: "GET" });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.warn(
      { err, workerBaseUrl: WORKER_BASE_URL },
      "Worker health proxy failed",
    );
    res.status(502).json(PROXY_ERROR_BODY);
  }
});

router.post("/worker/run-spike", async (req, res) => {
  try {
    const result = await callWorker("/worker/run-spike", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.warn(
      { err, workerBaseUrl: WORKER_BASE_URL },
      "Worker run-spike proxy failed",
    );
    res.status(502).json(PROXY_ERROR_BODY);
  }
});

router.post("/worker/memory/embed-spike", async (req, res) => {
  try {
    const result = await callWorker("/worker/memory/embed-spike", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.warn(
      { err, workerBaseUrl: WORKER_BASE_URL },
      "Worker memory embed-spike proxy failed",
    );
    res.status(502).json(PROXY_ERROR_BODY);
  }
});

router.post("/worker/memory/search-spike", async (req, res) => {
  try {
    const result = await callWorker("/worker/memory/search-spike", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.warn(
      { err, workerBaseUrl: WORKER_BASE_URL },
      "Worker memory search-spike proxy failed",
    );
    res.status(502).json(PROXY_ERROR_BODY);
  }
});

export default router;
