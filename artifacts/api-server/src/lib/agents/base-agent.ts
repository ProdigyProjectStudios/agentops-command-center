import type { ZodTypeAny } from "zod";
import { generateAgentOutput, type AgentInvocation } from "../llm";
import type { AgentOutput, ToolCallRequest, WorkflowState } from "./types";
import { parseConfidence } from "./types";

export interface AgentEnvelope {
  summary: string;
  findings: string[];
  risks: string[];
  recommendedActions: string[];
  toolCallsRequested?: ToolCallRequest[];
  confidence: number;
}

export interface BaseAgentConfig<TDetails extends Record<string, unknown>> {
  slug: string;
  name: string;
  systemPrompt: string;
  detailsSchema: ZodTypeAny;
  /** Build the deterministic demo-mode payload from current state. */
  demoDetails: (state: WorkflowState) => TDetails;
  /** Project the (LLM-augmented or demo) details into the AgentOutput envelope. */
  buildEnvelope: (details: TDetails, state: WorkflowState) => AgentEnvelope;
  /** Optional prompt builder; defaults to title + description. */
  buildPrompt?: (state: WorkflowState) => string;
}

/**
 * BaseAgent is the canonical multi-agent abstraction. Every node delegates
 * to a BaseAgent instance via `agent.run(state)`, guaranteeing every
 * persisted agent_steps.output row conforms to the AgentOutput contract
 * regardless of which agent produced it.
 *
 * The class is intentionally thin: it composes the per-agent config,
 * delegates to `generateAgentOutput` for LLM/demo handling (preserving the
 * existing fallback semantics), and projects the result into the uniform
 * envelope.
 */
export class BaseAgent<TDetails extends Record<string, unknown>> {
  readonly slug: string;
  readonly name: string;
  constructor(private readonly cfg: BaseAgentConfig<TDetails>) {
    this.slug = cfg.slug;
    this.name = cfg.name;
  }

  async run(state: WorkflowState): Promise<AgentOutput> {
    const demoDetails = this.cfg.demoDetails(state);
    const userPrompt = this.cfg.buildPrompt
      ? this.cfg.buildPrompt(state)
      : `${state.request.title}\n\n${state.request.description}`;
    const invocation: AgentInvocation = {
      agentSlug: this.cfg.slug,
      agentName: this.cfg.name,
      systemPrompt: this.cfg.systemPrompt,
      userPrompt,
      demoFallback: demoDetails,
      schema: this.cfg.detailsSchema,
    };
    const details = (await generateAgentOutput(invocation)) as TDetails;
    const env = this.cfg.buildEnvelope(details, state);
    return {
      summary: env.summary,
      findings: env.findings,
      risks: env.risks,
      recommendedActions: env.recommendedActions,
      toolCallsRequested: env.toolCallsRequested ?? [],
      confidence: parseConfidence(env.confidence),
      details,
    };
  }
}

/**
 * Backwards-compatible functional wrapper. Equivalent to
 * `new BaseAgent({...}).run(state)` but synthesizes a minimal state when
 * called from non-state-aware code paths (tests, ad-hoc usage).
 */
export async function runAgent<TDetails extends Record<string, unknown>>(
  cfg: BaseAgentConfig<TDetails> & { demoDetailsValue?: TDetails },
  userPrompt: string,
): Promise<AgentOutput> {
  const fakeState = {
    request: { title: userPrompt, description: "" },
  } as unknown as WorkflowState;
  const agent = new BaseAgent({
    ...cfg,
    buildPrompt: () => userPrompt,
  });
  return agent.run(fakeState);
}
