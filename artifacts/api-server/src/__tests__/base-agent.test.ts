import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

process.env["OPENAI_API_KEY"] = "test-key";
delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

let nextResponse: { content: string | null } = { content: "{}" };

class FakeOpenAI {
  constructor(_opts: unknown) {}
  chat = {
    completions: {
      create: async (_req: unknown, _opts?: unknown) => ({
        choices: [{ message: { content: nextResponse.content } }],
      }),
    },
  };
}

mock.module("openai", { defaultExport: FakeOpenAI });

const { runAgent } = await import("../lib/agents/base-agent.js");
const { agentOutputSchema } = await import("../lib/agents/types.js");

const detailsSchema = z.object({
  classification: z.string(),
  riskLevel: z.string(),
});

const demoDetails = { classification: "demo", riskLevel: "low" };

beforeEach(() => {
  nextResponse = { content: "{}" };
});

test("runAgent returns AgentOutput envelope wrapping demo details on fallback", async () => {
  nextResponse = { content: null };
  const out = await runAgent(
    {
      agentSlug: "x",
      agentName: "X",
      systemPrompt: "sys",
      detailsSchema,
      demoDetails,
      buildEnvelope: (d) => ({
        summary: `Class=${d["classification"]}`,
        findings: [`risk=${d["riskLevel"]}`],
        risks: [],
        recommendedActions: ["ok"],
        confidence: 0.9,
      }),
    },
    "user",
  );
  assert.ok(agentOutputSchema.safeParse(out).success);
  assert.equal(out.summary, "Class=demo");
  assert.deepEqual(out.details, demoDetails);
  assert.equal(out.confidence, 0.9);
  assert.deepEqual(out.toolCallsRequested, []);
});

test("runAgent merges LLM details into envelope when valid", async () => {
  nextResponse = {
    content: JSON.stringify({ classification: "from-llm", riskLevel: "high" }),
  };
  const out = await runAgent(
    {
      agentSlug: "x",
      agentName: "X",
      systemPrompt: "sys",
      detailsSchema,
      demoDetails,
      buildEnvelope: (d) => ({
        summary: `Class=${d["classification"]}`,
        findings: [`risk=${d["riskLevel"]}`],
        risks: [],
        recommendedActions: [],
        confidence: 0.77,
      }),
    },
    "user",
  );
  assert.equal(out.summary, "Class=from-llm");
  assert.equal((out.details as Record<string, unknown>)["riskLevel"], "high");
  assert.equal(out.confidence, 0.77);
});

test("runAgent clamps confidence values into [0,1]", async () => {
  const out = await runAgent(
    {
      agentSlug: "x",
      agentName: "X",
      systemPrompt: "sys",
      detailsSchema,
      demoDetails,
      buildEnvelope: () => ({
        summary: "s",
        findings: [],
        risks: [],
        recommendedActions: [],
        confidence: 5,
      }),
    },
    "user",
  );
  assert.equal(out.confidence, 1);
});
