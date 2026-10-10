import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importText, importFile } = require("../../test-results/sources-build/backend/sources/ingest.js");
const { POST, runtime } = require("../../test-results/sources-build/app/api/sources/route.js");
const { validateImportedSource, normalizeSourceText } = require("../../test-results/sources-build/backend/contracts/validate.js");
const { SOURCE_LIMITS } = require("../../test-results/sources-build/backend/contracts/source-limits.js");
const fixture = name => readFile(new URL(`fixtures/${name}`, import.meta.url));
const valid = source => {
  const result = validateImportedSource(JSON.parse(JSON.stringify(source)));
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.ok(source.document.blocks.every(b => b.documentId === source.document.id));
  assert.equal(new Set(source.document.blocks.map(b => b.id)).size, source.document.blocks.length);
  for (const block of source.document.blocks) {
    const segment = source.originalSegments.find(s => s.id === block.original.segmentId);
    assert.equal(normalizeSourceText(segment.text.slice(block.original.charRange.start, block.original.charRange.end)), block.text);
    assert.equal(source.normalizedText.slice(block.normalizedRange.start, block.normalizedRange.end), block.text);
    assert.ok(block.text.length <= SOURCE_LIMITS.blockCharacters);
  }
};
const failure = (code, status) => error => error.code === code && error.status === status;
const textRequest = (text, title) => new Request("http://localhost/api/sources", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ schemaVersion: "1.0", source: { kind: "text", text, ...(title !== undefined ? { title } : {}) } }),
});
const fileRequest = (bytes, name = "lesson.bin", mime = "application/octet-stream", title) => {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type: mime }));
  if (title !== undefined) form.set("title", title);
  return new Request("http://localhost/api/sources", { method: "POST", body: form });
};
const envelope = async (request, status) => {
  const response = await POST(request);
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.schemaVersion, "1.0");
  assert.equal(body.ok, status === 200);
  if (body.ok) valid(body.data); else {
    assert.equal(body.error.retryable, false);
    assert.equal("stack" in body.error, false);
  }
  return body;
};

test("text normalization preserves raw text, single line breaks, negation and formulas", () => {
  const raw = "  Plants do not release CO2.\r\nE = mc^2.\r\n\r\nSecond paragraph.  ";
  const source = importText(raw, "  Lesson  ");
  valid(source);
  assert.equal(source.originalSegments[0].text, raw);
  assert.equal(source.document.title, "Lesson");
  assert.equal(source.normalizedText, "Plants do not release CO2.\nE = mc^2.\n\nSecond paragraph.");
  assert.equal(source.document.blocks.length, 2);
  assert.deepEqual(source.document.blocks.map(b => b.location.paragraph), [1, 2]);
  assert.ok(source.document.blocks.every(b => b.location.page === undefined));
  assert.equal("graph" in source, false);
});

test("CR, LF and CRLF are normalized without turning single line breaks into paragraphs", () => {
  for (const newline of ["\r", "\n", "\r\n"]) {
    const source = importText(`First line.${newline}Second line.${newline} ${newline}Third paragraph.`);
    valid(source);
    assert.equal(source.document.blocks.length, 2);
    assert.equal(source.document.blocks[0].text, "First line.\nSecond line.");
  }
});

test("source and block IDs are assigned once per import and are distinct across imports", () => {
  const first = importText("First.\n\nSecond.");
  const second = importText("First.\n\nSecond.");
  valid(first);
  valid(second);
  assert.notEqual(first.document.id, second.document.id);
  assert.deepEqual(first, JSON.parse(JSON.stringify(first)));
});

test("many short paragraphs retain every block and CRLF offset without prefix rescanning", () => {
  const source = importText("A.\r\n\r\n".repeat(5_000));
  valid(source);
  assert.equal(source.document.blocks.length, 5_000);
  assert.equal(source.document.blocks.at(-1).location.paragraph, 5_000);
});

test("text and title limits include the exact allowed boundaries", () => {
  const source = importText("x".repeat(100_000), "t".repeat(200));
  valid(source);
  assert.equal(source.normalizedText.length, 100_000);
  assert.throws(() => importText("x".repeat(100_001)), failure("PAYLOAD_TOO_LARGE", 413));
  assert.throws(() => importText("Text", "t".repeat(201)), failure("PAYLOAD_TOO_LARGE", 413));
  assert.throws(() => importText(" ".repeat(100_001)), failure("PAYLOAD_TOO_LARGE", 413));
});

test("long paragraphs prefer sentence boundaries and preserve Unicode surrogate pairs", () => {
  const raw = `${"a".repeat(1800)}. ${"b".repeat(1800)}. ${"🌱".repeat(2000)}`;
  const source = importText(raw);
  valid(source);
  assert.equal(source.document.blocks[0].text, `${"a".repeat(1800)}.`);
  assert.equal(source.normalizedText, raw);
  assert.ok(source.document.blocks.every(b => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(b.text)));
});

test("empty text and invalid title values are rejected", () => {
  for (const text of ["", " \t\r\n "]) assert.throws(() => importText(text), failure("INVALID_REQUEST", 400));
  assert.throws(() => importText("Text", 3), failure("INVALID_REQUEST", 400));
  assert.equal(importText("Text", "   ").document.title, undefined);
});

test("PDF extracts real text and keeps separate physical pages", async () => {
  const bytes = await fixture("text.pdf");
  const source = await importFile(bytes, "Lesson");
  valid(source);
  assert.equal(source.document.kind, "pdf");
  assert.equal(source.metadata.pageCount, 2);
  assert.equal(source.metadata.fileSizeBytes, bytes.length);
  assert.deepEqual(source.document.blocks.map(b => b.location.page), [1, 2]);
  assert.match(source.normalizedText, /Chlorophyll absorbs light energy/);
  assert.match(source.normalizedText, /Photosynthesis releases oxygen/);
  assert.deepEqual(source.warnings, []);
});

test("partially empty PDFs preserve every page and explicitly warn about unread text", async () => {
  const source = await importFile(await fixture("partial.pdf"));
  valid(source);
  assert.equal(source.metadata.pageCount, 3);
  assert.deepEqual(source.originalSegments.map(s => s.page), [1, 2, 3]);
  assert.deepEqual(source.document.blocks.map(b => b.location.page), [1, 3]);
  assert.equal(source.warnings[0].code, "EMPTY_PDF_PAGE");
  assert.equal(source.warnings[0].page, 2);
});

test("PDFs at the exact 30-page boundary remain valid", async () => {
  const source = await importFile(await fixture("page-limit.pdf"));
  valid(source);
  assert.equal(source.metadata.pageCount, 30);
});

const fileErrors = [
  ["image-only.pdf", "OCR_UNSUPPORTED", 422],
  ["empty.pdf", "OCR_UNSUPPORTED", 422],
  ["password.pdf", "PASSWORD_REQUIRED", 422],
  ["corrupt.pdf", "UNREADABLE_DOCUMENT", 422],
  ["too-many-pages.pdf", "PAYLOAD_TOO_LARGE", 413],
  ["too-much-text.pdf", "PAYLOAD_TOO_LARGE", 413],
  ["corrupt.docx", "UNREADABLE_DOCUMENT", 422],
  ["malformed-xml.docx", "UNREADABLE_DOCUMENT", 422],
  ["empty.docx", "UNREADABLE_DOCUMENT", 422],
  ["not-docx.zip", "UNREADABLE_DOCUMENT", 422],
  ["expanded-limit.docx", "PAYLOAD_TOO_LARGE", 413],
  ["too-much-text.docx", "PAYLOAD_TOO_LARGE", 413],
];
for (const [name, code, status] of fileErrors) {
  test(`rejects ${name} with a safe ${code} error`, async () => {
    const bytes = await fixture(name);
    await assert.rejects(importFile(bytes), failure(code, status));
    const response = await envelope(fileRequest(bytes, name), status);
    assert.equal(response.error.code, code);
    assert.ok(response.error.message.length < 250);
  });
}

test("DOCX keeps paragraph and table-cell order without fabricating page numbers", async () => {
  const source = await importFile(await fixture("paragraphs-table.docx"));
  valid(source);
  assert.equal(source.document.kind, "docx");
  assert.deepEqual(source.document.blocks.map(b => b.text), [
    "Photosynthesis requires light energy.",
    "Plants do not consume oxygen in this source assertion.",
    "Input", "Output", "Water", "Glucose", "End of the synthetic lesson.",
  ]);
  assert.deepEqual(source.document.blocks.map(b => b.location.paragraph), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(source.document.blocks.every(b => b.location.page === undefined));
  assert.equal(source.metadata.pageCount, undefined);
  assert.equal(source.warnings[0].code, "DOCX_EXTRACTION_WARNING");
});

test("actual bytes determine file type rather than filename, extension or MIME", async () => {
  const result = await envelope(fileRequest(await fixture("paragraphs-table.docx"), "fake.pdf", "application/pdf"), 200);
  assert.equal(result.data.document.kind, "docx");
  const fake = await envelope(fileRequest(new TextEncoder().encode("Not a PDF"), "fake.pdf", "application/pdf"), 415);
  assert.equal(fake.error.code, "UNSUPPORTED_SOURCE");
  await assert.rejects(importFile(new Uint8Array()), failure("INVALID_REQUEST", 400));
  await assert.rejects(importFile(new Uint8Array(3_000_001)), failure("PAYLOAD_TOO_LARGE", 413));
});

test("JSON and multipart route contracts work without any API key", async () => {
  assert.equal(runtime, "nodejs");
  const text = await envelope(textRequest("  First.\r\nSecond.  ", " Lesson "), 200);
  assert.equal(text.data.document.title, "Lesson");
  assert.equal(text.data.originalSegments[0].text, "  First.\r\nSecond.  ");
  const blankTitle = await envelope(textRequest("Text", "  "), 200);
  assert.equal(blankTitle.data.document.title, undefined);
  await envelope(fileRequest(await fixture("text.pdf"), "lesson.pdf", "application/pdf", " Lesson "), 200);
});

const invalidJson = [
  null, {}, { schemaVersion: "2.0", source: { kind: "text", text: "Text" } },
  { schemaVersion: "1.0", source: { kind: "text", text: "" } },
  { schemaVersion: "1.0", source: { kind: "text", text: 3 } },
  { schemaVersion: "1.0", source: { kind: "text", text: "Text" }, file: "PDF" },
  { schemaVersion: "1.0", source: { kind: "pdf" } },
];
for (const [index, payload] of invalidJson.entries()) test(`rejects invalid JSON payload ${index + 1}`, async () => {
  const response = await envelope(new Request("http://localhost/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), 400);
  assert.equal(response.error.code, "INVALID_REQUEST");
});

test("malformed JSON, UTF-8, multipart and unsupported media types return non-200 errors", async () => {
  for (const body of ["{", new Uint8Array([0xff])]) await envelope(new Request("http://localhost/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body }), 400);
  await envelope(new Request("http://localhost/api/sources", { method: "POST", headers: { "content-type": "multipart/form-data" }, body: "invalid" }), 400);
  await envelope(new Request("http://localhost/api/sources", { method: "POST", headers: { "content-type": "text/plain" }, body: "Text" }), 415);
});

test("ambiguous/duplicate multipart inputs are rejected", async () => {
  const bytes = await fixture("text.pdf");
  for (const variation of ["text", "duplicate-file", "duplicate-title", "file-string", "no-file"]) {
    const form = new FormData();
    if (variation !== "no-file") form.append("file", variation === "file-string" ? "fake" : new File([bytes], "lesson.pdf"));
    if (variation === "text") form.append("text", "Source text");
    if (variation === "duplicate-file") form.append("file", new File([bytes], "second.pdf"));
    if (variation === "duplicate-title") { form.append("title", "First"); form.append("title", "Second"); }
    await envelope(new Request("http://localhost/api/sources", { method: "POST", body: form }), 400);
  }
});

test("route enforces title, text, file and actual request bytes regardless of Content-Length", async () => {
  await envelope(textRequest("x".repeat(100_001)), 413);
  await envelope(textRequest("Text", "t".repeat(201)), 413);
  await envelope(fileRequest(new Uint8Array(3_000_001)), 413);
  const oversized = new Request("http://localhost/api/sources", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "1" },
    body: "x".repeat(SOURCE_LIMITS.requestBytes + 1),
  });
  const error = await envelope(oversized, 413);
  assert.equal(error.error.code, "PAYLOAD_TOO_LARGE");
});

const invalidOutputs = [
  ["wrong document reference", s => { s.document.blocks[0].documentId = "wrong"; }],
  ["duplicate block ID", s => { s.document.blocks[1].id = s.document.blocks[0].id; }],
  ["unknown original segment", s => { s.document.blocks[0].original.segmentId = "unknown"; }],
  ["modified normalized text", s => { s.normalizedText = "Rewritten knowledge"; }],
  ["modified block", s => { s.document.blocks[0].text = "Rewritten knowledge"; }],
  ["overlapping original ranges", s => { s.document.blocks[1].original.charRange.start = 0; }],
  ["missing content", s => { s.document.blocks.pop(); }],
  ["wrong normalized range", s => { s.document.blocks[0].normalizedRange.start = 1; }],
  ["fake text page", s => { s.document.blocks[0].location.page = 1; }],
  ["wrong character count", s => { s.metadata.originalCharacterCount++; }],
  ["unknown output field", s => { s.graph = {}; }],
];
for (const [name, mutate] of invalidOutputs) test(`output validator detects ${name}`, () => {
  const source = importText("First.\n\nSecond.");
  mutate(source);
  assert.equal(validateImportedSource(source).valid, false);
});

test("output validator rejects DOCX pages and missing PDF page warnings", async () => {
  const docx = await importFile(await fixture("paragraphs-table.docx"));
  docx.originalSegments[0].page = 1;
  assert.equal(validateImportedSource(docx).valid, false);
  const pdf = await importFile(await fixture("partial.pdf"));
  pdf.warnings = [];
  assert.equal(validateImportedSource(pdf).valid, false);
});
