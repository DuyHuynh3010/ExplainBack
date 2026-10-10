/** Smoke tests against an already-running Next.js production server. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateImportedSource } = require("../../test-results/sources-build/backend/contracts/validate.js");
const endpoint = `${process.env.SOURCE_API_BASE_URL ?? "http://127.0.0.1:3100"}/api/sources`;
const file = name => readFile(new URL(`fixtures/${name}`, import.meta.url));
async function check(body, headers, status, code) {
  const response = await fetch(endpoint, { method: "POST", body, headers });
  assert.equal(response.status, status);
  const payload = await response.json();
  assert.equal(payload.ok, status === 200);
  if (payload.ok) {
    const result = validateImportedSource(payload.data);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
  } else assert.equal(payload.error.code, code);
  return payload;
}

test("production HTTP JSON source ingestion", async () => {
  const result = await check(JSON.stringify({ schemaVersion: "1.0", source: { kind: "text", title: "Lesson", text: "  First.\r\n\r\nSecond.  " } }), { "content-type": "application/json" }, 200);
  assert.equal(result.data.normalizedText, "First.\n\nSecond.");
  assert.equal(result.data.document.blocks.length, 2);
});

for (const [name, kind, status, code] of [
  ["text.pdf", "pdf", 200], ["partial.pdf", "pdf", 200],
  ["paragraphs-table.docx", "docx", 200],
  ["image-only.pdf", undefined, 422, "OCR_UNSUPPORTED"],
  ["password.pdf", undefined, 422, "PASSWORD_REQUIRED"],
  ["corrupt.pdf", undefined, 422, "UNREADABLE_DOCUMENT"],
  ["corrupt.docx", undefined, 422, "UNREADABLE_DOCUMENT"],
  ["expanded-limit.docx", undefined, 413, "PAYLOAD_TOO_LARGE"],
]) test(`production HTTP multipart ${name}`, async () => {
  const form = new FormData();
  form.set("file", new File([await file(name)], "untrusted-name.bin", { type: "application/octet-stream" }));
  form.set("title", "Synthetic source");
  const result = await check(form, undefined, status, code);
  if (kind) assert.equal(result.data.document.kind, kind);
});

test("production HTTP invalid and oversized text return proper error statuses", async () => {
  await check(JSON.stringify({ schemaVersion: "1.0", source: { kind: "text", text: "   " } }), { "content-type": "application/json" }, 400, "INVALID_REQUEST");
  await check(JSON.stringify({ schemaVersion: "1.0", source: { kind: "text", text: "x".repeat(100_001) } }), { "content-type": "application/json" }, 413, "PAYLOAD_TOO_LARGE");
});
