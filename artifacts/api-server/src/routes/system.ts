import { Router, type IRouter } from "express";
import { getLlmMode, hasApiKey } from "../lib/llm";

const router: IRouter = Router();

router.get("/system/mode", (_req, res) => {
  res.json({ mode: getLlmMode(), hasApiKey: hasApiKey() });
});

export default router;
