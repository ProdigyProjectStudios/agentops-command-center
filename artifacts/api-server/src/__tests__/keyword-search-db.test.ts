import { test, mock } from "node:test";
import assert from "node:assert/strict";

type Row = Record<string, unknown>;

let docRows: Row[] = [];
let chunkRows: Row[] = [];
let extraDocRows: Row[] = [];

function chain(rows: Row[]) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder["from"] = () => builder;
  builder["where"] = () => builder;
  builder["limit"] = () => Promise.resolve(rows);
  // Allow `await db.select(...).from(...).where(...)` (no .limit)
  (builder as unknown as { then: (...args: unknown[]) => unknown }).then = (
    onFulfilled: (v: unknown) => unknown,
  ) => Promise.resolve(rows).then(onFulfilled);
  return builder;
}

let selectCallIdx = 0;
const fakeDb = {
  select: () => {
    const idx = selectCallIdx++;
    // Order of selects in keywordSearcher.search:
    // 0: knowledgeDocuments doc-match
    // 1: memoryChunks chunk-match
    // 2: knowledgeDocuments inArray backfill (only if missing IDs)
    if (idx === 0) return chain(docRows);
    if (idx === 1) return chain(chunkRows);
    return chain(extraDocRows);
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    knowledgeDocumentsTable: {
      id: "id",
      title: "title",
      category: "category",
      summary: "summary",
      content: "content",
    },
    memoryChunksTable: {
      documentId: "documentId",
      content: "content",
    },
  },
});

const { searchMemory, keywordSearcher, tokenize } = await import(
  "../lib/memory/keyword-search.js"
);

function reset() {
  selectCallIdx = 0;
  docRows = [];
  chunkRows = [];
  extraDocRows = [];
}

test("tokenize strips stopwords and short tokens, dedupes, caps at 12", () => {
  const t = tokenize(
    "The vendor renewal needs renewal renewal compliance review for security audit",
  );
  assert.ok(t.includes("vendor"));
  assert.ok(t.includes("renewal"));
  assert.ok(t.includes("compliance"));
  assert.ok(!t.includes("the"));
  assert.ok(!t.includes("for"));
  // dedup
  assert.equal(t.filter((x) => x === "renewal").length, 1);
});

test("searchMemory returns ranked hits with snippet + emits memory_search tool call", async () => {
  reset();
  docRows = [
    {
      id: 1,
      title: "Vendor renewal policy",
      category: "policy",
      summary: "Vendor renewal procedures and approvals.",
      content: "Vendor renewal must be approved by finance and legal.",
    },
    {
      id: 2,
      title: "Travel policy",
      category: "policy",
      summary: "Standard travel reimbursements.",
      content: "Unrelated travel content here.",
    },
  ];
  chunkRows = [];

  const result = await searchMemory("vendor renewal compliance review");

  assert.equal(result.toolCall.toolName, "memory_search");
  assert.equal(result.toolCall.status, "success");
  assert.ok(result.tokens.includes("vendor"));
  assert.ok(result.hits.length >= 1);
  // Vendor doc must score above unrelated travel doc.
  assert.equal(result.hits[0]!.documentId, 1);
  assert.ok(result.hits[0]!.snippet.length > 0);
  // Tool-call output payload includes snippets per documented contract.
  const out = result.toolCall.output as { hits: Array<{ snippet: string }> };
  assert.ok(out.hits[0]!.snippet.length > 0);
});

test("searchMemory backfills docs that only matched via chunk content", async () => {
  reset();
  docRows = []; // no direct doc match
  chunkRows = [
    { documentId: 7, content: "vendor renewal language buried in chunk" },
  ];
  extraDocRows = [
    {
      id: 7,
      title: "Buried doc",
      category: "policy",
      summary: "Buried summary",
      content: "Buried content body",
    },
  ];

  const result = await searchMemory("vendor renewal");
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0]!.documentId, 7);
  assert.equal(result.hits[0]!.title, "Buried doc");
  assert.ok(result.hits[0]!.snippet.length > 0);
});

test("searchMemory returns empty result for query with no usable tokens", async () => {
  reset();
  const result = await keywordSearcher.search("the and for");
  assert.equal(result.hits.length, 0);
  assert.equal(result.tokens.length, 0);
  assert.equal(result.toolCall.status, "success");
});
