import { SOURCE_LIMITS } from "../contracts/source-limits";
import type { ImportedSource } from "../contracts/domain";
import { SourceImportError, tooLarge } from "./errors";
import { buildImportedSource, normalizeTitle } from "./normalize";
import { extractPdf } from "./pdf";
import { extractDocx } from "./docx";

export function importText(text: string, title?: unknown): ImportedSource {
  const normalizedTitle = normalizeTitle(title);
  if (text.length > SOURCE_LIMITS.textCharacters) tooLarge("Source text exceeds 100,000 UTF-16 characters.");
  return buildImportedSource("text", [{ text }], normalizedTitle);
}

export async function importFile(bytes: Uint8Array, title?: unknown): Promise<ImportedSource> {
  const normalizedTitle = normalizeTitle(title);
  if (bytes.byteLength > SOURCE_LIMITS.fileBytes) tooLarge("File exceeds 3,000,000 bytes.");
  if (!bytes.byteLength) throw new SourceImportError("INVALID_REQUEST", 400, "File must not be empty.");
  // Metadata cannot establish file type. Parsers validate content after magic detection.
  const head = Buffer.from(bytes.subarray(0, 8));
  if (head.subarray(0, 5).toString("ascii") === "%PDF-") {
    const { originals, warnings } = await extractPdf(bytes);
    return buildImportedSource("pdf", originals, normalizedTitle, bytes.byteLength, warnings);
  }
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4) {
    const { originals, warnings } = await extractDocx(bytes);
    return buildImportedSource("docx", originals, normalizedTitle, bytes.byteLength, warnings);
  }
  throw new SourceImportError("UNSUPPORTED_SOURCE", 415, "Only genuine text-layer PDF and DOCX files are supported.");
}
