import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "../lib/memory/keyword-search";

test("tokenize lowercases, dedupes, drops short/stopwords", () => {
  const tokens = tokenize(
    "The Roofing contractor needs a roofing repair for the HQ facility!",
  );
  assert.ok(tokens.includes("roofing"));
  assert.ok(tokens.includes("contractor"));
  assert.ok(tokens.includes("repair"));
  assert.ok(tokens.includes("facility"));
  // dedupe: "roofing" appears twice in input but once in output
  assert.equal(tokens.filter((t) => t === "roofing").length, 1);
  // stopwords removed
  assert.equal(tokens.includes("the"), false);
  assert.equal(tokens.includes("for"), false);
  // short words dropped
  assert.equal(tokens.includes("hq"), false);
  assert.equal(tokens.includes("a"), false);
});

test("tokenize caps at 12 tokens", () => {
  const big = Array.from({ length: 30 }, (_, i) => `token${i}xyz`).join(" ");
  assert.equal(tokenize(big).length, 12);
});

test("tokenize returns empty for stopword-only input", () => {
  assert.deepEqual(tokenize("the and for with"), []);
});
