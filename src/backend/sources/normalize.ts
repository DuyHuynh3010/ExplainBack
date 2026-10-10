import { randomUUID } from "node:crypto";
import type { ImportedSource, OriginalSourceSegment, SourceBlock, SourceWarning } from "../contracts/domain";
import { SOURCE_LIMITS } from "../contracts/source-limits";
import { normalizeSourceText, validateImportedSource } from "../contracts/validate";
import { SourceImportError, tooLarge } from "./errors";

export function normalizeTitle(title: unknown): string | undefined {
  if (title === undefined) return undefined;
  if (typeof title !== "string") throw new SourceImportError("INVALID_REQUEST", 400, "Title must be a string.");
  if (title.length > SOURCE_LIMITS.titleCharacters) tooLarge("Title exceeds 200 UTF-16 characters.");
  return title.trim() || undefined;
}

/** Ranges are measured in ORIGINAL segment text; no header/footer or word-joining heuristics. */
function paragraphRanges(text: string): { start: number; end: number; paragraph: number }[] {
  const ranges: { start: number; end: number; paragraph: number }[] = [];
  const delimiter = /(?:\r\n|\r(?!\n)|\n)[ \t]*(?:\r\n|\r(?!\n)|\n)(?:[ \t]*(?:\r\n|\r(?!\n)|\n))*/g;
  let start = 0;
  let paragraph = 1;
  for (const match of text.matchAll(delimiter)) {
    if (text.slice(start, match.index).trim()) ranges.push({ start, end: match.index, paragraph: paragraph++ });
    start = match.index! + match[0].length;
  }
  if (text.slice(start).trim()) ranges.push({ start, end: text.length, paragraph });
  return ranges;
}

function splitRange(text: string, start: number, end: number): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  while (start < end) {
    if (!text.slice(start, end).trim()) break;
    let cut = Math.min(start + SOURCE_LIMITS.blockCharacters, end);
    if (cut < end) {
      const candidate = text.slice(start, cut);
      const sentences = [...candidate.matchAll(/[.!?]["')\]]?(?=\s)/g)];
      const sentence = sentences.at(-1);
      const whitespace = candidate.search(/\s+\S*$/);
      if (sentence) cut = start + sentence.index! + sentence[0].length;
      else if (whitespace > 0) cut = start + whitespace;
      // A hard split must not separate a surrogate pair or a CRLF newline.
      if (cut > start && ((/[\uD800-\uDBFF]/.test(text[cut - 1]) && /[\uDC00-\uDFFF]/.test(text[cut])) || (text[cut - 1] === "\r" && text[cut] === "\n"))) cut--;
    }
    ranges.push({ start, end: cut });
    start = cut;
  }
  return ranges;
}

export function buildImportedSource(
  kind: ImportedSource["document"]["kind"],
  originals: { text: string; page?: number }[],
  title?: string,
  fileSizeBytes?: number,
  warnings: SourceWarning[] = [],
): ImportedSource {
  const originalCharacterCount = originals.map(s => s.text).join("\n\n").length;
  if (originalCharacterCount > SOURCE_LIMITS.textCharacters) tooLarge("Source text exceeds 100,000 UTF-16 characters.");
  const documentId = randomUUID();
  const originalSegments: OriginalSourceSegment[] = originals.map(s => ({ id: randomUUID(), ...s }));
  const normalizedText = originalSegments.map(s => normalizeSourceText(s.text)).join("\n\n");
  const blocks: SourceBlock[] = [];
  let segmentOffset = 0;
  for (const segment of originalSegments) {
    const leadingWhitespace = segment.text.replace(/\r\n?/g, "\n").match(/^\s*/)?.[0].length ?? 0;
    // Build a linear-time offset map instead of repeatedly normalizing every prefix.
    const offsets = new Uint32Array(segment.text.length + 1);
    for (let i = 0; i < segment.text.length; i++) {
      offsets[i + 1] = offsets[i] + (segment.text[i] === "\n" && segment.text[i - 1] === "\r" ? 0 : 1);
    }
    for (const paragraph of paragraphRanges(segment.text)) {
      for (const range of splitRange(segment.text, paragraph.start, paragraph.end)) {
        const text = normalizeSourceText(segment.text.slice(range.start, range.end));
        if (!text) continue;
        const originalSlice = segment.text.slice(range.start, range.end);
        const firstCharacter = range.start + originalSlice.length - originalSlice.trimStart().length;
        const normalizedStart = segmentOffset + offsets[firstCharacter] - leadingWhitespace;
        blocks.push({
          id: randomUUID(), documentId, text,
          location: { paragraph: paragraph.paragraph, ...(segment.page ? { page: segment.page } : {}) },
          original: { segmentId: segment.id, charRange: range },
          normalizedRange: { start: normalizedStart, end: normalizedStart + text.length },
        });
      }
    }
    segmentOffset += normalizeSourceText(segment.text).length + 2;
  }
  if (!normalizedText.trim()) throw new SourceImportError("INVALID_REQUEST", 400, "Source text must not be empty.");
  if (normalizedText.length > SOURCE_LIMITS.textCharacters) tooLarge("Normalized source text exceeds 100,000 UTF-16 characters.");
  const source: ImportedSource = {
    schemaVersion: "1.0", document: { id: documentId, kind, ...(title ? { title } : {}), blocks },
    originalSegments, normalizedText,
    metadata: {
      extractor: ({ text: "text", pdf: "unpdf", docx: "mammoth" } as const)[kind],
      originalCharacterCount, normalizedCharacterCount: normalizedText.length,
      ...(fileSizeBytes !== undefined ? { fileSizeBytes } : {}),
      ...(kind === "pdf" ? { pageCount: originals.length } : {}),
    },
    warnings,
  };
  if (!validateImportedSource(source).valid) throw new SourceImportError("SOURCE_IMPORT_FAILED", 500, "Imported source failed contract validation.");
  return source;
}
