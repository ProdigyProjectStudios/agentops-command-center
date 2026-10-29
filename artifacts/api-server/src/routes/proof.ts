import { Router, type IRouter } from "express";
import { z } from "zod";
import { evaluateScenario, scenarios } from "../lib/proof-engine";
const router: IRouter = Router();
const input = z
  .object({
    scenarioId: z.string().max(64),
    documents: z
      .array(
        z.enum([
          "referral",
          "coverage",
          "supporting-note",
          "encounter",
          "claim",
        ]),
      )
      .max(5)
      .optional(),
    duplicate: z.boolean().optional(),
  })
  .strict();
const reviewInput = input.extend({ decision: z.enum(["approve", "reject"]) });
router.get("/proof/scenarios", (_req, res) => res.json({ scenarios }));
router.post("/proof/evaluate", (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Choose a synthetic scenario." });
  if (!scenarios.some((s) => s.id === parsed.data.scenarioId))
    return res.status(404).json({ error: "Unknown scenario." });
  return res.json(
    evaluateScenario(parsed.data.scenarioId, undefined, parsed.data),
  );
});
router.post("/proof/review", (req, res) => {
  const parsed = reviewInput.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: "A scenario and explicit approve/reject decision are required.",
    });
  if (!scenarios.some((s) => s.id === parsed.data.scenarioId))
    return res.status(404).json({ error: "Unknown scenario." });
  const result = evaluateScenario(
    parsed.data.scenarioId,
    parsed.data.decision,
    parsed.data,
  );
  return res.status(result.status === "blocked" ? 409 : 200).json(result);
});
export default router;
