import { Router, type IRouter } from "express";
import { getLlmMode, hasApiKey } from "../lib/llm";
import {
  applyModelSettingsUpdate,
  getModelSettings,
} from "../lib/model-config";
import {
  UpdateSystemModelsBody,
  type ModelSettings as ModelSettingsDto,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/system/mode", (_req, res) => {
  res.json({ mode: getLlmMode(), hasApiKey: hasApiKey() });
});

router.get("/system/models", async (_req, res): Promise<void> => {
  const settings = await getModelSettings();
  const dto: ModelSettingsDto = {
    defaultModel: settings.defaultModel,
    effectiveDefaultSource: settings.effectiveDefaultSource,
    available: settings.available.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      tier: m.tier,
    })),
    overrides: settings.overrides,
  };
  res.json(dto);
});

router.put("/system/models", async (req, res): Promise<void> => {
  const parsed = UpdateSystemModelsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await applyModelSettingsUpdate({
      ...(parsed.data.defaultModel !== undefined
        ? { defaultModel: parsed.data.defaultModel }
        : {}),
      overrides: (parsed.data.overrides ?? []).map((ov) => ({
        agentSlug: ov.agentSlug,
        modelOverride: ov.modelOverride ?? null,
      })),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to update models",
    });
    return;
  }
  const settings = await getModelSettings();
  const dto: ModelSettingsDto = {
    defaultModel: settings.defaultModel,
    effectiveDefaultSource: settings.effectiveDefaultSource,
    available: settings.available.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      tier: m.tier,
    })),
    overrides: settings.overrides,
  };
  res.json(dto);
});

export default router;
