import type { RecordedToolCall } from "./types";
/** Only memory_search currently executes a real tool in the legacy graph. */
export function labelGraphToolEvidence(
  call: RecordedToolCall,
): RecordedToolCall {
  if (call.toolName === "memory_search")
    return {
      ...call,
      output: { ...call.output, executionKind: "database-search" },
    };
  return {
    ...call,
    durationMs: 0,
    output: {
      executionKind: "simulation",
      externalActionPerformed: false,
      demonstrationOutput: call.output,
    },
    outputSummary: `Simulated tool record; no external action. ${call.outputSummary}`,
  };
}
