import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

type Row = Record<string, unknown>;

let settingRows: Row[] = [];
let agentRows: Row[] = [];
const updateAgentCalls: Array<{ slug: string; modelOverride: string | null }> =
  [];
const insertSettingCalls: Array<{ value: unknown }> = [];

function selectFrom(rows: Row[]) {
  const b: Record<string, (...args: unknown[]) => unknown> = {};
  b["from"] = () => b;
  b["where"] = () => Promise.resolve(rows);
  b["orderBy"] = () => Promise.resolve(rows);
  (b as unknown as { then: (...a: unknown[]) => unknown }).then = (
    f: (v: unknown) => unknown,
  ) => Promise.resolve(rows).then(f);
  return b;
}

const baseDb = {
  select: () => ({
    from: (tbl: unknown) => {
      const name = (tbl as { _?: { name?: string } } | undefined)?._?.name;
      if (name === "system_settings") return selectFrom(settingRows);
      if (name === "agents") return selectFrom(agentRows);
      return selectFrom([]);
    },
  }),
  insert: (_tbl: unknown) => ({
    values: (vals: { value: unknown }) => {
      insertSettingCalls.push({ value: vals.value });
      return {
        onConflictDoUpdate: () => Promise.resolve(),
      };
    },
  }),
  update: (_tbl: unknown) => ({
    set: (vals: { modelOverride: string | null }) => ({
      where: () => ({
        returning: () => {
          const slug = pendingUpdateSlug;
          updateAgentCalls.push({ slug, modelOverride: vals.modelOverride });
          const found = agentRows.find((a) => a["slug"] === slug);
          return Promise.resolve(found ? [found] : []);
        },
      }),
    }),
  }),
};

const fakeDb = {
  ...baseDb,
  transaction: async <T>(cb: (tx: typeof baseDb) => Promise<T>): Promise<T> => {
    return cb(baseDb);
  },
};

let pendingUpdateSlug = "";

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    systemSettingsTable: { _: { name: "system_settings" } },
    agentsTable: { _: { name: "agents" } },
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: (col: unknown, val: unknown) => {
      pendingUpdateSlug = String(val);
      return { col, val };
    },
  },
});

const {
  getModelForAgent,
  getModelSettings,
  setDefaultModel,
  setAgentModelOverride,
  invalidateModelCache,
} = await import("../lib/model-config.js");

beforeEach(() => {
  settingRows = [];
  agentRows = [
    { id: 1, slug: "ops-conductor", name: "Ops Conductor", modelOverride: null },
    { id: 2, slug: "legal-counsel", name: "Legal Counsel", modelOverride: null },
  ];
  updateAgentCalls.length = 0;
  insertSettingCalls.length = 0;
  invalidateModelCache();
  delete process.env["LLM_MODEL"];
});

test("getModelForAgent falls back to env when no DB setting and no override", async () => {
  process.env["LLM_MODEL"] = "gpt-4.1";
  const m = await getModelForAgent("ops-conductor");
  assert.equal(m, "gpt-4.1");
});

test("getModelForAgent falls back to hardcoded default when no env and no DB", async () => {
  const m = await getModelForAgent("ops-conductor");
  assert.equal(m, "gpt-4o-mini");
});

test("getModelForAgent uses stored DB default", async () => {
  settingRows = [{ key: "default_model", value: "gpt-4o" }];
  const m = await getModelForAgent("ops-conductor");
  assert.equal(m, "gpt-4o");
});

test("getModelForAgent prefers per-agent override over default", async () => {
  settingRows = [{ key: "default_model", value: "gpt-4o" }];
  agentRows = [
    {
      id: 1,
      slug: "ops-conductor",
      name: "Ops Conductor",
      modelOverride: "gpt-4.1",
    },
    {
      id: 2,
      slug: "legal-counsel",
      name: "Legal Counsel",
      modelOverride: null,
    },
  ];
  assert.equal(await getModelForAgent("ops-conductor"), "gpt-4.1");
  assert.equal(await getModelForAgent("legal-counsel"), "gpt-4o");
});

test("setDefaultModel rejects unknown models", async () => {
  await assert.rejects(() => setDefaultModel("totally-fake-model"), /Unknown/);
});

test("setDefaultModel persists known models and invalidates cache", async () => {
  await setDefaultModel("gpt-4o");
  assert.equal(insertSettingCalls.at(-1)?.value, "gpt-4o");
});

test("setAgentModelOverride rejects unknown model id", async () => {
  await assert.rejects(
    () => setAgentModelOverride("ops-conductor", "fake"),
    /Unknown/,
  );
});

test("setAgentModelOverride accepts null to clear", async () => {
  await setAgentModelOverride("ops-conductor", null);
  assert.deepEqual(updateAgentCalls.at(-1), {
    slug: "ops-conductor",
    modelOverride: null,
  });
});

test("getModelSettings reports source=env when only env var set", async () => {
  process.env["LLM_MODEL"] = "gpt-4.1-mini";
  const s = await getModelSettings();
  assert.equal(s.defaultModel, "gpt-4.1-mini");
  assert.equal(s.effectiveDefaultSource, "env");
  assert.ok(s.available.length > 0);
  assert.equal(s.overrides.length, 2);
});

test("getModelSettings reports source=system_settings when DB row present", async () => {
  settingRows = [{ key: "default_model", value: "gpt-4o" }];
  const s = await getModelSettings();
  assert.equal(s.defaultModel, "gpt-4o");
  assert.equal(s.effectiveDefaultSource, "system_settings");
});
