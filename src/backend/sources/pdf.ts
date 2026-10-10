import { getDocumentProxy } from "unpdf";
import { SOURCE_LIMITS } from "../contracts/source-limits";
import type { SourceWarning } from "../contracts/domain";
import { SourceImportError, tooLarge, unreadable } from "./errors";

export async function extractPdf(bytes: Uint8Array) {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes), {
      verbosity: 0, useSystemFonts: true, disableFontFace: true,
      // No rendering, font binaries, OCR, or external resources are requested.
      useWasm: false,
    });
    if (pdf.numPages > SOURCE_LIMITS.pdfPages) tooLarge("PDF exceeds 30 pages.");
    const originals: { text: string; page: number }[] = [];
    const warnings: SourceWarning[] = [];
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          characters += item.str.length + (item.hasEOL ? 1 : 0);
          if (characters + (pageNumber - 1) * 2 > SOURCE_LIMITS.textCharacters) tooLarge("Extracted PDF text exceeds 100,000 UTF-16 characters.");
          text += item.str + (item.hasEOL ? "\n" : "");
        }
        originals.push({ text, page: pageNumber });
        if (!text.trim()) warnings.push({ code: "EMPTY_PDF_PAGE", page: pageNumber, message: "This page has no extractable text. Image content was not read; OCR is not supported." });
      } finally {
        page.cleanup();
      }
    }
    if (originals.every(p => !p.text.trim())) throw new SourceImportError("OCR_UNSUPPORTED", 422, "PDF has no usable text layer. Scanned/image-only PDFs require OCR, which is not supported.");
    return { originals, warnings };
  } catch (error) {
    if (error instanceof SourceImportError) throw error;
    if (error instanceof Error && error.name === "PasswordException") throw new SourceImportError("PASSWORD_REQUIRED", 422, "Password-protected PDFs are not supported.");
    unreadable("PDF is damaged or cannot be read.");
  } finally {
    if (pdf) await pdf.loadingTask.destroy();
  }
}
