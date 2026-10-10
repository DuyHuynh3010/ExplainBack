import mammoth from "mammoth";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import type { Readable } from "node:stream";
import { SOURCE_LIMITS } from "../contracts/source-limits";
import type { SourceWarning } from "../contracts/domain";
import { SourceImportError, tooLarge, unreadable } from "./errors";

/** Uses the ZIP library, not a custom ZIP/XML parser; validates actual inflated sizes. */
async function inspectDocxArchive(bytes: Buffer): Promise<void> {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, file) => {
      if (error || !file) reject(error ?? new Error("Invalid archive")); else resolve(file);
    });
  });
  if (zip.entryCount > SOURCE_LIMITS.docxEntries) { zip.close(); tooLarge("DOCX exceeds the archive entry limit."); }
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let declaredSize = 0;
    let actualSize = 0;
    let stream: Readable | undefined;
    const names = new Set<string>();
    let contentTypes = "";
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      stream?.destroy();
      zip.close();
      reject(error);
    };
    zip.on("error", fail);
    zip.on("entry", (entry: Entry) => {
      if (finished) return;
      if (names.has(entry.fileName)) return fail(new SourceImportError("UNREADABLE_DOCUMENT", 422, "DOCX contains duplicate archive entries."));
      names.add(entry.fileName);
      if (entry.isEncrypted()) return fail(new SourceImportError("UNREADABLE_DOCUMENT", 422, "Encrypted DOCX archives are not supported."));
      declaredSize += entry.uncompressedSize;
      if (declaredSize > SOURCE_LIMITS.docxExpandedBytes || entry.uncompressedSize > SOURCE_LIMITS.docxEntryBytes) return fail(new SourceImportError("PAYLOAD_TOO_LARGE", 413, "DOCX exceeds the decompressed content limit."));
      if (entry.fileName.endsWith("/")) { zip.readEntry(); return; }
      zip.openReadStream(entry, (error, opened) => {
        if (error) return fail(error);
        if (finished) { opened.destroy(); return; }
        stream = opened;
        let entrySize = 0;
        const chunks: Buffer[] = [];
        opened.on("error", fail);
        opened.on("data", (chunk: Buffer) => {
          actualSize += chunk.length;
          entrySize += chunk.length;
          if (actualSize > SOURCE_LIMITS.docxExpandedBytes || entrySize > SOURCE_LIMITS.docxEntryBytes) return fail(new SourceImportError("PAYLOAD_TOO_LARGE", 413, "DOCX exceeds the decompressed content limit."));
          if (entry.fileName === "[Content_Types].xml") chunks.push(chunk);
        });
        opened.on("end", () => {
          if (finished) return;
          if (entry.fileName === "[Content_Types].xml") contentTypes = Buffer.concat(chunks).toString("utf8");
          stream = undefined;
          zip.readEntry();
        });
      });
    });
    zip.on("end", () => {
      if (finished) return;
      finished = true;
      zip.close();
      if (!["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every(name => names.has(name)) || !contentTypes.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")) {
        reject(new SourceImportError("UNREADABLE_DOCUMENT", 422, "File is not a supported DOCX document."));
      } else resolve();
    });
    zip.readEntry();
  });
}

export async function extractDocx(bytes: Uint8Array) {
  try {
    const buffer = Buffer.from(bytes);
    await inspectDocxArchive(buffer);
    // Raw text preserves paragraph order (including paragraphs in table cells).
    // Mammoth's raw-text API reads only archive data, without external file access.
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) unreadable("DOCX contains no usable text.");
    if (result.value.length > SOURCE_LIMITS.textCharacters) tooLarge("Extracted DOCX text exceeds 100,000 UTF-16 characters.");
    const warnings: SourceWarning[] = [{
      code: "DOCX_EXTRACTION_WARNING",
      message: result.messages.length
        ? "Some DOCX elements could not be fully represented as text. Review the original document; table formatting, images, and complex equations may be absent."
        : "DOCX extraction preserves paragraph and table-cell text, not table layout, images, or complex equation formatting. Review the original document when these are important.",
    }];
    return { originals: [{ text: result.value }], warnings };
  } catch (error) {
    if (error instanceof SourceImportError) throw error;
    unreadable("DOCX is damaged or cannot be read.");
  }
}
