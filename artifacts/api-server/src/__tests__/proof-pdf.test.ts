import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proofTemplates,
  proofInputSchema,
  pdfDocumentFromPages,
  editablePdfCopy,
  proofPackHtml,
  type ProofRun,
} from "@workspace/api-zod";
import { assessProof } from "../lib/proof-assessment";
import { publicProof } from "../lib/proof-store";

const input = () => {
  const value = structuredClone(proofTemplates[0].input);
  const lines = value.documents[0].text.split("\n");
  value.documents = [
    pdfDocumentFromPages("synthetic.pdf", "a".repeat(64), [
      lines.slice(0, 2).join("\n"),
      lines.slice(2).join("\n"),
    ]),
  ];
  return value;
};
test("PDF intake requires review and preserves exact page-local citations", () => {
  const value = input();
  assert.equal(proofInputSchema.safeParse(value).success, false);
  value.documents[0].pdf!.reviewed = true;
  const parsed = proofInputSchema.parse(value);
  const analysis = assessProof(parsed);
  assert.equal(analysis.blockers.length, 0);
  assert.deepEqual(
    analysis.citations
      .filter((c) => c.field === "amount")
      .map((c) => [c.page, c.pageLine, c.line, c.quote]),
    [[2, 1, 3, "Amount: 2400"]],
  );
  const before = analysis.fingerprint;
  value.documents[0].pdf!.sha256 = "b".repeat(64);
  assert.notEqual(assessProof(value).fingerprint, before);
});
test("PDF page maps reject missing, overlapping, descending and out-of-bounds starts", () => {
  for (const starts of [[], [2], [1, 1], [1, 4, 3], [1, 100]]) {
    const value = input();
    value.documents[0].pdf = {
      ...value.documents[0].pdf!,
      reviewed: true,
      pageStarts: starts,
    };
    assert.equal(proofInputSchema.safeParse(value).success, false);
  }
});
test("PDF intake rejects empty pages, page count and text length overflow", () => {
  assert.throws(
    () => pdfDocumentFromPages("test.pdf", "a".repeat(64), ["field: yes", " "]),
    /Page 2/,
  );
  assert.throws(
    () => pdfDocumentFromPages("test.pdf", "a".repeat(64), Array(21).fill("x")),
    /20 pages/,
  );
  assert.throws(
    () => pdfDocumentFromPages("test.pdf", "a".repeat(64), ["x".repeat(16001)]),
    /16,000/,
  );
});
test("manual correction removes PDF page claims and leaves original evidence unchanged", () => {
  const value = input();
  value.documents[0].pdf!.reviewed = true;
  const original = structuredClone(value);
  const fixed = editablePdfCopy(value.documents[0]);
  fixed.text = fixed.text.replace("2400", "1200");
  value.documents[0] = fixed;
  assert.equal(proofInputSchema.safeParse(value).success, true);
  assert.equal(fixed.pdf, undefined);
  assert.equal(fixed.editedFromPdf?.sha256, "a".repeat(64));
  const analysis = assessProof(value);
  assert.equal(analysis.fields.amount, "1200");
  assert.ok(
    analysis.citations.every(
      (c) => c.sourceKind === "edited-pdf-text" && !c.page,
    ),
  );
  assert.ok(original.documents[0].text.includes("2400"));
  assert.notEqual(analysis.fingerprint, assessProof(original).fingerprint);
  fixed.pdf = original.documents[0].pdf;
  assert.equal(proofInputSchema.safeParse(value).success, false);
});
test("shared PDF evidence and printable packs retain citation pages without raw source text", () => {
  const value = input();
  value.documents[0].pdf!.reviewed = true;
  value.documents[0].text += "\nUNCITED-PRIVATE-TEXT";
  const run: ProofRun = {
    id: "test-pdf",
    input: value,
    analysis: assessProof(value),
    status: "awaiting-review",
    createdAt: "2026-10-29T00:00:00Z",
    updatedAt: "2026-10-29T00:00:00Z",
    events: [],
    review: null,
    receipt: null,
    delivery: {
      attempts: 0,
      lastAttemptAt: null,
      verifiedAt: null,
      error: null,
    },
  };
  const shared = publicProof(run);
  assert.equal("text" in shared.input.documents[0], false);
  assert.equal("pdf" in shared.input.documents[0], false);
  assert.ok(shared.analysis.citations.some((c) => c.page === 2));
  const html = proofPackHtml(shared);
  assert.match(html, /PDF page 2 · extracted line 1/);
  assert.ok(!html.includes("UNCITED-PRIVATE-TEXT"));
});
