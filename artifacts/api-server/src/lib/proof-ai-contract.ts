import { z } from "zod";
import type { ProofAnalysis } from "@workspace/api-zod";
import { ProofError } from "./proof-store";

export const reviewSchema = z
  .object({
    notes: z
      .array(
        z
          .object({
            findingId: z.string(),
            explanation: z.string().min(10).max(1200),
            citationIds: z.array(z.string()).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export function validateProofAi(value: unknown, analysis: ProofAnalysis) {
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success)
    throw new ProofError(
      502,
      "Live AI returned an invalid review. No run or approval was created.",
    );
  for (const note of parsed.data.notes) {
    const finding = analysis.findings.find((f) => f.id === note.findingId);
    if (
      !finding ||
      note.citationIds.some((id) => !finding.citationIds.includes(id))
    )
      throw new ProofError(
        502,
        "Live AI cited evidence outside the relevant finding. No run or approval was created.",
      );
  }
  return parsed.data.notes;
}
