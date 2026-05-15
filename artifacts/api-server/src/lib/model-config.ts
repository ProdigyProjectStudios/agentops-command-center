/**
 * Resolves which LLM model powers each agent at runtime.
 *
 * Resolution order, highest priority first:
 *   1. Per-agent override stored in `agents.model_override`
 *   2. Global default stored under the `default_model` key in
 *      `system_settings`
 *   3. Process env var `LLM_MODEL`
 *   4. The hard-coded FALLBACK_DEFAULT_MODEL
 *
 * Lookups are cached in-process for a short TTL so the hot agent path does
 * not hit the DB on every invocation. Cache invalidation happens whenever
 * the settings routes mutate either the default or an override.
 */
import { eq } from "drizzle-orm";
import {
  agentsTable,
  db,
  systemSettingsTable,
  type Agent,
} from "@workspace/db";
import { logger } from "./logger";
import {
  AVAILABLE_MODELS,
  FALLBACK_DEFAULT_MODEL,
  isKnownModel,
} from "./llm-models";

const DEFAULT_MODEL_KEY = "default_model";
const CACHE_TTL_MS = 30_000;

interface ModelCache {
  defaultModel: string;
  overrides: Map<string, string | null>;
  expiresAt: number;
}

let cache: ModelCache | null = null;

function envDefault(): string {
  const env = process.env["LLM_MODEL"];
  if (env && env.length > 0) return env;
  return FALLBACK_DEFAULT_MODEL;
}

async function loadCache(): Promise<ModelCache> {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const [settingRow] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, DEFAULT_MODEL_KEY));
  const stored =
    settingRow && typeof settingRow.value === "string"
      ? (settingRow.value as string)
      : null;
  const defaultModel = stored && stored.length > 0 ? stored : envDefault();

  const agents = await db.select().from(agentsTable);
  const overrides = new Map<string, string | null>();
  for (const a of agents) {
    overrides.set(a.slug, a.modelOverride ?? null);
  }
  cache = {
    defaultModel,
    overrides,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return cache;
}

export function invalidateModelCache(): void {
  cache = null;
}

export async function getModelForAgent(agentSlug: string): Promise<string> {
  try {
    const c = await loadCache();
    const override = c.overrides.get(agentSlug);
    if (override && override.length > 0) return override;
    return c.defaultModel;
  } catch (err) {
    logger.warn(
      { err, agentSlug },
      "Failed to resolve model from DB; falling back to env default",
    );
    return envDefault();
  }
}

export interface ModelSettings {
  defaultModel: string;
  effectiveDefaultSource: "system_settings" | "env" | "fallback";
  overrides: Array<{
    agentSlug: string;
    agentName: string;
    modelOverride: string | null;
  }>;
  available: typeof AVAILABLE_MODELS;
}

export async function getModelSettings(): Promise<ModelSettings> {
  const [settingRow] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, DEFAULT_MODEL_KEY));
  const storedDefault =
    settingRow && typeof settingRow.value === "string"
      ? (settingRow.value as string)
      : null;

  let defaultModel: string;
  let source: ModelSettings["effectiveDefaultSource"];
  if (storedDefault && storedDefault.length > 0) {
    defaultModel = storedDefault;
    source = "system_settings";
  } else if (process.env["LLM_MODEL"] && process.env["LLM_MODEL"].length > 0) {
    defaultModel = process.env["LLM_MODEL"];
    source = "env";
  } else {
    defaultModel = FALLBACK_DEFAULT_MODEL;
    source = "fallback";
  }

  const agents: Agent[] = await db
    .select()
    .from(agentsTable)
    .orderBy(agentsTable.slug);

  return {
    defaultModel,
    effectiveDefaultSource: source,
    overrides: agents.map((a) => ({
      agentSlug: a.slug,
      agentName: a.name,
      modelOverride: a.modelOverride,
    })),
    available: AVAILABLE_MODELS,
  };
}

export async function setDefaultModel(model: string): Promise<void> {
  if (!isKnownModel(model)) {
    throw new Error(`Unknown model: ${model}`);
  }
  await db
    .insert(systemSettingsTable)
    .values({ key: DEFAULT_MODEL_KEY, value: model, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: model, updatedAt: new Date() },
    });
  invalidateModelCache();
}

export async function setAgentModelOverride(
  agentSlug: string,
  model: string | null,
): Promise<void> {
  if (model !== null && !isKnownModel(model)) {
    throw new Error(`Unknown model: ${model}`);
  }
  const result = await db
    .update(agentsTable)
    .set({ modelOverride: model })
    .where(eq(agentsTable.slug, agentSlug))
    .returning();
  if (result.length === 0) {
    throw new Error(`Agent not found: ${agentSlug}`);
  }
  invalidateModelCache();
}

/**
 * Apply a default-model change and a batch of per-agent overrides atomically.
 * If any update fails (unknown model, missing agent), the whole batch rolls
 * back so partial state never leaks through the API.
 */
export async function applyModelSettingsUpdate(input: {
  defaultModel?: string;
  overrides?: Array<{ agentSlug: string; modelOverride: string | null }>;
}): Promise<void> {
  if (input.defaultModel !== undefined && !isKnownModel(input.defaultModel)) {
    throw new Error(`Unknown model: ${input.defaultModel}`);
  }
  for (const ov of input.overrides ?? []) {
    if (ov.modelOverride !== null && !isKnownModel(ov.modelOverride)) {
      throw new Error(`Unknown model: ${ov.modelOverride}`);
    }
  }

  await db.transaction(async (tx) => {
    if (input.defaultModel !== undefined) {
      await tx
        .insert(systemSettingsTable)
        .values({
          key: DEFAULT_MODEL_KEY,
          value: input.defaultModel,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettingsTable.key,
          set: { value: input.defaultModel, updatedAt: new Date() },
        });
    }
    for (const ov of input.overrides ?? []) {
      const result = await tx
        .update(agentsTable)
        .set({ modelOverride: ov.modelOverride })
        .where(eq(agentsTable.slug, ov.agentSlug))
        .returning();
      if (result.length === 0) {
        throw new Error(`Agent not found: ${ov.agentSlug}`);
      }
    }
  });
  invalidateModelCache();
}
