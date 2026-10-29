import type { ProofDocument } from "./proof-contract";

/** Preserve page boundaries without claiming PDF text-layer order is visual reading order. */
export function pdfDocumentFromPages(
  name: string,
  sha256: string,
  pages: string[],
): ProofDocument {
  if (!pages.length || pages.length > 20)
    throw new Error("Use a PDF with 1–20 pages.");
  const normalized = pages.map((text, i) => {
    const value = text.replace(/\r\n?/g, "\n").trim();
    if (!value)
      throw new Error(
        `Page ${i + 1} has no extractable text. Scanned or blank pages require review outside this intake; OCR is not available.`,
      );
    return value;
  });
  const text = normalized.join("\n");
  if (text.length > 16000)
    throw new Error(
      "Extracted text exceeds 16,000 characters. Split the PDF into smaller documents.",
    );
  let next = 1;
  const pageStarts = normalized.map((page) => {
    const start = next;
    next += page.split("\n").length;
    return start;
  });
  return { name, text, pdf: { sha256, reviewed: false, pageStarts } };
}

export function pdfLineReference(doc: ProofDocument, line: number) {
  if (!doc.pdf)
    return doc.editedFromPdf ? { sourceKind: "edited-pdf-text" as const } : {};
  let index = 0;
  for (let i = 1; i < doc.pdf.pageStarts.length; i++) {
    if (doc.pdf.pageStarts[i] > line) break;
    index = i;
  }
  return {
    page: index + 1,
    pageLine: line - doc.pdf.pageStarts[index] + 1,
    sourceKind: "pdf-text" as const,
  };
}

export function editablePdfCopy(doc: ProofDocument): ProofDocument {
  if (!doc.pdf) return doc;
  return {
    name: `${doc.name.slice(0, 85)}.reviewed.txt`,
    text: doc.text,
    editedFromPdf: { name: doc.name, sha256: doc.pdf.sha256 },
  };
}
