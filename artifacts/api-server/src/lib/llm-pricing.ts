/**
 * Centralized LLM pricing configuration.
 *
 * Prices are USD per 1,000,000 tokens as published by OpenAI (2026-08).
 * Update this file — and nowhere else — when pricing changes.
 *
 * Unknown/unconfigured models return `pricingAvailable: false` so callers
 * can represent the cost as genuinely unknown rather than guessing.
 */

export interface ModelPricing {
  /** USD per 1,000,000 input (prompt) tokens. */
  inputPricePer1M: number;
  /** USD per 1,000,000 output (completion) tokens. */
  outputPricePer1M: number;
}

/**
 * Priced model catalog.  Keys are the model IDs accepted by the OpenAI API.
 *
 * All four models that appear in AVAILABLE_MODELS (llm-models.ts) must have
 * an entry here so operators always see a cost estimate.  Add new models as
 * they are added to AVAILABLE_MODELS.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // ── Frontier ────────────────────────────────────────────────────────────
  "gpt-4.1":    { inputPricePer1M: 2.00, outputPricePer1M: 8.00 },
  "o4-mini":    { inputPricePer1M: 1.10, outputPricePer1M: 4.40 },

  // ── Balanced ─────────────────────────────────────────────────────────────
  "gpt-4.1-mini": { inputPricePer1M: 0.40, outputPricePer1M: 1.60 },

  // ── Fast / cheap ─────────────────────────────────────────────────────────
  "gpt-4.1-nano": { inputPricePer1M: 0.10, outputPricePer1M: 0.40 },
} as const;

// ── Result types ────────────────────────────────────────────────────────────

export interface CostKnown {
  pricingAvailable: true;
  /** Estimated cost in microdollars (USD × 1,000,000). Always an integer. */
  estimatedCostMicros: number;
}

export interface CostUnknown {
  pricingAvailable: false;
  estimatedCostMicros: null;
}

export type CostResult = CostKnown | CostUnknown;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return pricing for a model, or null if the model is not in the catalog.
 * Never throws.
 */
export function getModelPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] ?? null;
}

/**
 * Estimate cost from token counts for a known model.
 *
 * Returns `pricingAvailable: false` when the model is not in the catalog;
 * callers must handle this case explicitly — do NOT substitute zero.
 *
 * Never throws.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostResult {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return { pricingAvailable: false, estimatedCostMicros: null };
  }
  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputPricePer1M +
    (outputTokens / 1_000_000) * pricing.outputPricePer1M;
  return {
    pricingAvailable: true,
    estimatedCostMicros: Math.round(costUsd * 1_000_000),
  };
}
