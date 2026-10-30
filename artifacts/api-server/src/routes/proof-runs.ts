import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  proofInputSchema,
  proofReviewSchema,
  proofTemplates,
} from "@workspace/api-zod";
import { ProofError } from "../lib/proof-store";
import { ProofService } from "../lib/proof-service";

import { GithubProofHandoff, integrationAuthorized } from "../lib/proof-github";
export function proofRunsRouter(
  service: ProofService,
  sandboxSecret: string,
  integration?: { handoff: GithubProofHandoff; operatorKey: string },
  evaluationKey?: string,
) {
  const router = Router();
  const endpoint =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res)).catch(next);
    };
  const owner = (req: Request) => {
    const token = req.header("x-proof-owner") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new ProofError(401, "A browser workspace key is required.");
    return token;
  };
  const id = (req: Request) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) throw new ProofError(400, "Invalid run ID.");
    return parsed.data;
  };
  const internal = (req: Request) => {
    const actual = Buffer.from(req.header("authorization") ?? ""),
      expected = Buffer.from(`Bearer ${sandboxSecret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new ProofError(401, "Sandbox service credentials required.");
  };
  router.use("/proof", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
    next();
  });
  router.get("/proof/templates", (_req, res) => res.json(proofTemplates));
  router.get(
    "/proof/evaluations",
    endpoint(async (req, res) =>
      res.json(await service.store.evaluations(owner(req))),
    ),
  );
  router.post(
    "/proof/evaluations",
    endpoint(async (req, res) => {
      const key = owner(req);
      const parsed = z
        .object({
          mode: z.enum(["rules", "live-ai"]),
          label: z.string().trim().min(3).max(100),
          liveCostAcknowledged: z.boolean().optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        throw new ProofError(400, "Supply an evaluation label and mode.");
      if (
        parsed.data.mode === "live-ai" &&
        parsed.data.liveCostAcknowledged !== true
      )
        throw new ProofError(
          400,
          "Confirm nine specialist reviews may incur provider charges, including retries.",
        );
      if (parsed.data.mode === "live-ai") {
        if (!evaluationKey || evaluationKey.length < 32)
          throw new ProofError(
            503,
            "Live benchmarks require a configured integration operator key.",
          );
        if (
          !integrationAuthorized(
            req.header("x-proof-integration-key") ?? "",
            evaluationKey,
          )
        )
          throw new ProofError(403, "An integration operator key is required.");
      }
      return res
        .status(201)
        .json(await service.evaluate(key, parsed.data.mode, parsed.data.label));
    }),
  );
  router.get(
    "/proof/runs",
    endpoint(async (req, res) =>
      res.json(await service.store.list(owner(req))),
    ),
  );
  router.post(
    "/proof/runs",
    endpoint(async (req, res) => {
      const key = owner(req),
        parsed = proofInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ProofError(
          400,
          "Supply 1–4 documents (at most 16,000 extracted characters each), a title, workflow and synthetic-data confirmation. PDF text requires reviewed, ordered page references.",
        );
      return res.status(201).json(await service.create(key, parsed.data));
    }),
  );
  router.get(
    "/proof/runs/:id",
    endpoint(async (req, res) =>
      res.json(await service.store.get(owner(req), id(req))),
    ),
  );
  router.post(
    "/proof/runs/:id/graph",
    endpoint(async (req, res) => {
      const key = owner(req);
      const parsed = z
        .object({
          mode: z.enum(["demo", "live-ai"]),
          liveCostAcknowledged: z.boolean().optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        throw new ProofError(400, "Choose a graph execution mode.");
      if (parsed.data.mode === "live-ai") {
        if (!parsed.data.liveCostAcknowledged)
          throw new ProofError(
            400,
            "Confirm that six graph model calls and retries may incur provider charges.",
          );
        if (!evaluationKey || evaluationKey.length < 32)
          throw new ProofError(
            503,
            "Live graph execution requires a configured integration operator key.",
          );
        if (
          !integrationAuthorized(
            req.header("x-proof-integration-key") ?? "",
            evaluationKey,
          )
        )
          throw new ProofError(403, "An integration operator key is required.");
      }
      return res.json(await service.runGraph(key, id(req), parsed.data.mode));
    }),
  );
  router.post(
    "/proof/runs/:id/graph/finalize",
    endpoint(async (req, res) =>
      res.json(await service.finalizeGraph(owner(req), id(req))),
    ),
  );
  router.post(
    "/proof/runs/:id/review",
    endpoint(async (req, res) => {
      const parsed = proofReviewSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ProofError(
          400,
          "An explicit decision, evidence fingerprint and review note are required.",
        );
      return res.json(await service.review(owner(req), id(req), parsed.data));
    }),
  );
  router.post(
    "/proof/runs/:id/retry",
    endpoint(async (req, res) =>
      res.json(await service.deliver(owner(req), id(req))),
    ),
  );
  router.get(
    "/proof/runs/:id/receipt",
    endpoint(async (req, res) => {
      await service.store.get(owner(req), id(req));
      return res.json(await service.store.receipt(id(req)));
    }),
  );
  for (const action of ["send", "verify"] as const) {
    router.post(
      `/proof/runs/:id/github/${action}`,
      endpoint(async (req, res) => {
        if (!integration)
          throw new ProofError(503, "GitHub handoff is not configured.");
        if (
          !integrationAuthorized(
            req.header("x-proof-integration-key") ?? "",
            integration.operatorKey,
          )
        )
          throw new ProofError(403, "An integration operator key is required.");
        if (action === "send" && req.body?.confirmExternal !== true)
          throw new ProofError(
            400,
            "Confirm creating a synthetic issue in the configured demo repository.",
          );
        return res.json(await integration.handoff[action](owner(req), id(req)));
      }),
    );
  }
  router.get(
    "/proof/runs/:id/export",
    endpoint(async (req, res) => {
      const run = await service.store.get(owner(req), id(req));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="agentops-proof-${run.id}.json"`,
      );
      return res.json(run);
    }),
  );
  router.get(
    "/proof/runs/:id/shares",
    endpoint(async (req, res) =>
      res.json(await service.store.shares(owner(req), id(req))),
    ),
  );
  router.post(
    "/proof/runs/:id/shares",
    endpoint(async (req, res) => {
      if (req.body?.confirmDisclosure !== true)
        throw new ProofError(
          400,
          "Confirm sharing the extracted values, source quotes, graph outputs and retrieved knowledge (if attached), and review note.",
        );
      return res
        .status(201)
        .json(await service.store.share(owner(req), id(req)));
    }),
  );
  router.delete(
    "/proof/runs/:id/shares/:shareId",
    endpoint(async (req, res) => {
      await service.store.revoke(
        owner(req),
        id(req),
        String(req.params.shareId),
      );
      return res.status(204).end();
    }),
  );
  router.get(
    "/proof/shared",
    endpoint(async (req, res) => {
      const token = req.header("x-proof-share") ?? "";
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new ProofError(
          404,
          "This proof link is unavailable, expired or revoked.",
        );
      return res.json(await service.store.shared(token));
    }),
  );
  router.post(
    "/proof/sandbox/submissions",
    endpoint(async (req, res) => {
      internal(req);
      const parsed = z
        .object({
          runId: z.string().uuid(),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success) throw new ProofError(400, "Invalid sandbox packet.");
      return res.json(
        await service.store.receive(parsed.data.runId, parsed.data.fingerprint),
      );
    }),
  );
  router.get(
    "/proof/sandbox/receipts/:id",
    endpoint(async (req, res) => {
      internal(req);
      return res.json(await service.store.receipt(id(req)));
    }),
  );
  router.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof ProofError)
        return res.status(err.status).json({ error: err.message });
      // Never leak documents, credentials or database errors to public callers.
      return res
        .status(503)
        .json({ error: "Proof storage is unavailable. Try again shortly." });
    },
  );
  return router;
}
