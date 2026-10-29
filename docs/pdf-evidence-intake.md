# Reviewed PDF evidence intake

Proof Lab accepts text-based PDFs alongside `.txt` and `.md` documents. PDF.js is lazy-loaded only when a PDF is selected; its worker ships with the application, with no CDN dependency. PDF limits are 5 MB, 20 pages and 16,000 extracted characters. Four documents per run remains the limit.

## Presenter walkthrough

1. Upload `docs/examples/synthetic-invoice-two-pages.pdf` and remove the prefilled sample document.
2. Expand both extracted pages and compare them with the original PDF. Evaluation stays disabled until PDF review and synthetic-data confirmation are checked.
3. Evaluate the run. Select the amount finding: it quotes `Amount: 2400` from PDF page 2, extracted line 3.
4. Record a review note, approve to the first-party sandbox and recheck the receipt. The timeline records PDF review and the original byte SHA-256; source-page citations also appear in JSON exports, shared snapshots and printable proof packs.
5. Choose **New from this run**, then **Convert to editable text** to demonstrate correction. Editing removes original page references and labels findings as edited evidence. The original saved run remains unchanged. To preserve page references instead, correct the PDF and upload it again.
6. Upload `docs/examples/synthetic-scan-no-text.pdf`: intake explicitly refuses the image-only page because OCR is not available. Failed uploads leave existing draft documents intact.

## Evidence boundaries

Parsing happens in the browser. Original PDF bytes are not uploaded or retained; the saved record contains extracted text, page-start lines, a byte fingerprint and a recorded operator review. Server validation enforces the review flag and ordered/in-range page starts, but does not independently verify the browser's page map against PDF bytes. This is operator-reviewed text evidence, not a signed original-document attestation.

The extractor handles text layers and still requires `Field: value` lines for policy checks. It does not infer fields from arbitrary prose, recognize scanned images, or produce a calibrated confidence score. Text order, tables, text embedded in images and mixed image/text pages require comparison with the original. Empty/image-only pages, excessive input, unsupported rotated text, password protection, parsing errors and timeout stop intake explicitly. Browser parsing has a 20-second deadline. Original source documents and workspace keys are excluded from public snapshots; cited quotes, filenames, fingerprints and timeline notes remain disclosed.

Manual correction retains the source filename and hash as history, but removes PDF page claims. These fields participate in the immutable run fingerprint. Existing text-only inputs and old saved runs remain compatible; no database migration is needed.

## Validation

- 40 proof tests pass, including new checks for the HTTP review gate, page-local citations, malformed page maps, size/page limits, edited-source provenance, immutable originals, fingerprints, export and public-source omission.
- Shared-library, frontend and backend typechecks pass; both application builds pass. The existing main-bundle warning remains; PDF parsing is a separate lazy chunk.
- Desktop browser preview: actual two-page PDF uploaded and extracted; both pages reviewed; premature evaluation disabled; evaluated and approved; page-two citation inspected; HTTP receipt rechecked. Browser SHA-256 matched the independent local checksum. Corrected text produced a separate run with `Amount: 1200` and no PDF page claim; the original run retained `2400` and its receipt after reloading. The image-only PDF was explicitly rejected.
- This was the production proof router/service/store in the standalone preview, not a Replit deployment. Full mobile, actual download completion, production restart durability and external GitHub activation remain outstanding from earlier QA. The browser screenshot file could not be synchronized back to the workspace, so no screenshot artifact is attached here.

Dependencies: pinned `pdfjs-dist@6.4.299` and `@noble/hashes@2.0.0`. SHA-256 uses the same implementation on HTTPS deployments and HTTP previews. The worker and library are bundled from the same package version. PDF.js usage follows its [official examples](https://mozilla.github.io/pdf.js/examples/); hashing uses the [noble-hashes API](https://github.com/paulmillr/noble-hashes).
