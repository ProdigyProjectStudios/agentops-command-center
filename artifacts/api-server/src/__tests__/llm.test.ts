import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

process.env["OPENAI_API_KEY"] = "test-key";
delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

let nextResponse: { content: string | null } | (() => never) = {
  content: "{}",
};

class FakeOpenAI {
  constructor(_opts: unknown) {}
  chat = {
    completions: {
      create: async (_req: unknown, _opts?: unknown) => {
        if (typeof nextResponse === "function") {
          (nextResponse as () => never)();
        }
        const r = nextResponse as { content: string | null };
        return {
          choices: [{ message: { content: r.content } }],
        };
      },
    },
  };
}

mock.module("openai", {
  defaultExport: FakeOpenAI,
});

const { generateAgentOutput } = await import("../lib/llm.js");

const schema = z.object({
  name: z.string(),
  count: z.number(),
  nested: z.object({
    a: z.string(),
    b: z.number(),
  }),
  tags: z.array(z.string()),
});

const demoFallback: Record<string, unknown> = {
  name: "demo-name",
  count: 7,
  nested: { a: "demo-a", b: 99 },
  tags: ["demo-tag"],
};

const baseInvocation = {
  agentSlug: "test-agent",
  agentName: "Test Agent",
  systemPrompt: "system",
  userPrompt: "user",
  demoFallback,
  schema,
};

beforeEach(() => {
  nextResponse = { content: "{}" };
});

test("falls back to demo when model returns empty content", async () => {
  nextResponse = { content: null };
  const out = await generateAgentOutput(baseInvocation);
  assert.deepEqual(out, demoFallback);
});

test("falls back to demo when model returns a non-object JSON value", async () => {
  nextResponse = { content: "[1,2,3]" };
  const out = await generateAgentOutput(baseInvocation);
  assert.deepEqual(out, demoFallback);
});

test("falls back to demo when response fails Zod validation", async () => {
  // count should be a number; supply a string -> partial schema validation fails.
  nextResponse = { content: JSON.stringify({ count: "not-a-number" }) };
  const out = await generateAgentOutput(baseInvocation);
  assert.deepEqual(out, demoFallback);
});

test("partial-but-valid response is deep-merged onto the demo fallback", async () => {
  nextResponse = {
    content: JSON.stringify({
      name: "from-llm",
      nested: { a: "from-llm-a" },
    }),
  };
  const out = await generateAgentOutput(baseInvocation);
  assert.equal(out["name"], "from-llm");
  assert.equal(out["count"], 7); // preserved from demo
  assert.deepEqual(out["nested"], { a: "from-llm-a", b: 99 });
  assert.deepEqual(out["tags"], ["demo-tag"]);
});

test("fully-valid response replaces demo values end-to-end", async () => {
  const full = {
    name: "real",
    count: 1,
    nested: { a: "x", b: 2 },
    tags: ["one", "two"],
  };
  nextResponse = { content: JSON.stringify(full) };
  const out = await generateAgentOutput(baseInvocation);
  assert.deepEqual(out, full);
});

test("falls back to demo when the API call throws", async () => {
  nextResponse = (() => {
    throw new Error("boom");
  }) as unknown as () => never;
  const out = await generateAgentOutput(baseInvocation);
  assert.deepEqual(out, demoFallback);
});

test("falls back to demo when content is not valid JSON", async () => {
  nextResponse = { content: "not json {" };
  const out = await generateAgentOutput(baseInvocation);
  assert.deepEqual(out, demoFallback);
});
