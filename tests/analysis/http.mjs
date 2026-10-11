/** Tests the real Next route without contacting Gemini; use an unconfigured test server. */
import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.SOURCE_API_BASE_URL ?? "http://127.0.0.1:3100";
const post = (path, payload) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

test("real /api/analysis requires an ImportedSource rather than raw text", async () => {
  const response = await post("/api/analysis", { schemaVersion: "2.0", source: { kind: "text", text: "Glucose stores chemical energy." } });
  assert.equal(response.status, 400); assert.equal((await response.json()).error.code, "INVALID_REQUEST");
});
test("sources -> analysis preserves stateless input and reports missing Gemini config", async () => {
  const sourceResponse = await post("/api/sources", { schemaVersion: "2.0", source: { kind: "text", text: "Glucose stores chemical energy." } });
  assert.equal(sourceResponse.status, 200); const importedSource = (await sourceResponse.json()).data;
  const response = await post("/api/analysis", { schemaVersion: "2.0", importedSource });
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, "AI_NOT_CONFIGURED");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("real /api/analysis rejects inconsistent offsets before provider creation", async () => {
  const sourceResponse = await post("/api/sources", { schemaVersion: "2.0", source: { kind: "text", text: "Glucose stores chemical energy." } });
  const importedSource = (await sourceResponse.json()).data; importedSource.document.blocks[0].normalizedRange.start++;
  const response = await post("/api/analysis", { schemaVersion: "2.0", importedSource });
  assert.equal(response.status, 400); assert.equal((await response.json()).error.code, "INVALID_REQUEST");
});
test("real /api/analysis rejects explicit questions and over-budget ingestion", async () => {
  for (const [text, status, code] of [["What is photosynthesis?", 422, "NO_EXTRACTABLE_KNOWLEDGE"], ["x".repeat(20_001), 413, "PAYLOAD_TOO_LARGE"]]) {
    const sourceResponse = await post("/api/sources", { schemaVersion: "2.0", source: { kind: "text", text } });
    assert.equal(sourceResponse.status, 200);
    const response = await post("/api/analysis", { schemaVersion: "2.0", importedSource: (await sourceResponse.json()).data });
    assert.equal(response.status, status); assert.equal((await response.json()).error.code, code);
  }
});
test("transcription and evaluation routes reject invalid bodies before AI", async () => {
  for (const path of ["/api/transcriptions", "/api/evaluations"]) assert.equal((await post(path, {})).status, 400);
});
