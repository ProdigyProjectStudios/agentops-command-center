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
    id: "gpt-4o",
    label: "GPT-4o",
    description:
      "Strongest general-purpose reasoning. Best for triage and synthesis.",
    tier: "frontier",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description:
      "Balanced cost and quality. A solid default for every agent.",
    tier: "balanced",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    description: "Higher quality reasoning with longer context windows.",
    tier: "frontier",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "Cheaper 4.1 variant — good for drafting comms.",
    tier: "balanced",
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    description: "Lowest cost. Use for memory lookups and scaffolding.",
    tier: "fast",
  },
] as const;

export const FALLBACK_DEFAULT_MODEL = "gpt-4o-mini";

export function isKnownModel(id: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === id);
}
