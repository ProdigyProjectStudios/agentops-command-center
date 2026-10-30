/**
 * Curated list of OpenAI-compatible chat models exposed in the AgentOps
 * settings UI. Keep this list short and opinionated — operators tune cost vs.
 * quality from this menu, not the entire OpenAI catalogue.
 */
export interface AvailableModel {
  id: string;
  label: string;
  description: string;
  tier: "frontier" | "balanced" | "fast";
}

export const AVAILABLE_MODELS: readonly AvailableModel[] = [
  {
    id: "gpt-6-luna",
    label: "GPT-6 Luna",
    description: "Fast focused review. Default for the CMS coverage worker.",
    tier: "fast",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    description:
      "Legacy general-purpose model.",
    tier: "frontier",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description:
      "Legacy balanced model; retained for existing configurations.",
    tier: "balanced",
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    description: "Lowest cost. Use for memory lookups and scaffolding.",
    tier: "fast",
  },
  {
    id: "o4-mini",
    label: "o4-mini",
    description: "Compact reasoning model. Strong on compliance and legal analysis.",
    tier: "frontier",
  },
] as const;

export const FALLBACK_DEFAULT_MODEL = "gpt-4.1-mini";

export function isKnownModel(id: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === id);
}
