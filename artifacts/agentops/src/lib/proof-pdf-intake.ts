import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pdfDocumentFromPages } from "@workspace/api-zod";
import { sha256 as hashBytes } from "@noble/hashes/sha2.js";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function readProofPdf(file: File) {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("PDFs must be 5 MB or smaller.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-")
    throw new Error("This file does not have a valid PDF header.");
  const digest = hashBytes(data);
  const sha256 = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const task = getDocument({
    data,
    stopAtErrors: true,
    useSystemFonts: false,
    disableFontFace: true,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const pdf = await task.promise;
        if (pdf.numPages > 20) throw new Error("Use a PDF with 1–20 pages.");
        const pages: string[] = [];
        let total = 0;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          const lines: string[] = [];
          let line = "",
            lastY: number | undefined,
            endX: number | undefined;
          const flush = () => {
            if (line.trim()) lines.push(line.trim());
            line = "";
            endX = undefined;
          };
          for (const item of content.items) {
            if (!("str" in item)) continue;
            if (
              Math.abs(item.transform[1]) > 0.01 ||
              Math.abs(item.transform[2]) > 0.01
            )
              throw new Error(
                `Page ${n} contains rotated text. Review and prepare a text document instead.`,
              );
            const y = item.transform[5],
              x = item.transform[4];
            if (lastY !== undefined && Math.abs(y - lastY) > 2) flush();
            const text = item.str.replace(/[\r\n\t]/g, " ");
            if (
              line &&
              endX !== undefined &&
              x - endX > 1 &&
              !line.endsWith(" ") &&
              !text.startsWith(" ")
            )
              line += " ";
            line += text;
            endX = x + item.width;
            lastY = y;
            if (item.hasEOL) flush();
          }
          flush();
          const text = lines.join("\n");
          total += text.length + 1;
          if (total > 16001)
            throw new Error(
              "Extracted text exceeds 16,000 characters. Split the PDF into smaller documents.",
            );
          pages.push(text);
          page.cleanup();
        }
        return pdfDocumentFromPages(file.name, sha256, pages);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "PDF extraction timed out. Try a smaller, simpler PDF.",
              ),
            ),
          20000,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new Error(
        "Password-protected PDFs are not supported. Provide an unlocked synthetic copy.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
