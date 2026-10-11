/** Synthetic AI responses verify UI mechanics only. No live provider calls. */
import { test, expect, type Page } from "@playwright/test";
import { importText } from "../src/backend/sources/ingest";
import { mockAnalysis } from "./ui-source-fixture";
import { normalizeEvaluation } from "../src/backend/explanations/evaluation";
import type { EvaluateTextRequest } from "../src/backend/contracts/api";
test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}` });
const envelope = (data: unknown) => JSON.stringify({ ok: true, schemaVersion: "2.0", data });
const error = JSON.stringify({ ok: false, schemaVersion: "2.0", error: { code: "AI_RATE_LIMITED", message: "Mock quota reached.", retryable: true } });

function mockEvaluation(input: EvaluateTextRequest) {
  const topicId = input.sourceAnalysis.graph.statements[0].topicId;
  return normalizeEvaluation(input, JSON.stringify({
    concepts: [{ id: "g", name: "Glucose", aliases: [] }, { id: "e", name: "Energy", aliases: [] }],
    claims: [{ id: "claim", representation: { kind: "binary", subjectConceptId: "g", relation: "stores", objectConceptId: "e" }, assertion: input.learner.text, negated: false, conditions: [], quote: input.learner.text }],
    comparisons: input.sourceAnalysis.graph.statements.map((s, i) => ({ referenceRelationshipId: s.id, status: i === 0 ? "correct" : "missing", learnerClaimIds: i === 0 ? ["claim"] : [], explanation: "Synthetic feedback for UI testing.", suggestions: [] })), additionalIdeas: [],
  }));
}
async function explain(page: Page) {
  await page.route("**/api/sources", r => { const b = r.request().postDataJSON(); return r.fulfill({ contentType: "application/json", body: envelope(importText(b.source.text)) }); });
  await page.route("**/api/analysis", r => r.fulfill({ contentType: "application/json", body: envelope(mockAnalysis(r.request().postDataJSON().importedSource)) }));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill("Glucose stores energy.\n\nChlorophyll absorbs light.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
}
async function fakeRecording(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    class Recorder extends EventTarget {
      static isTypeSupported() { return true; } state = "inactive"; mimeType = "audio/webm";
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob(["mock audio"], { type: this.mimeType }) })); this.dispatchEvent(new Event("stop")); }
    }
    Object.defineProperty(window, "MediaRecorder", { value: Recorder });
  });
}
async function record(page: Page) { await page.getByRole("button", { name: "Start recording", exact: true }).click(); await page.getByRole("button", { name: "Stop", exact: true }).click(); }
const transcript = { transcript: "Glucose does not store energy.", language: "en", warnings: [], audio: { mimeType: "audio/webm", bytes: 10 } };

test("mock: text evaluation retains source endpoints, shows statuses and real learner quotes, and can edit again", async ({ page }) => {
  let calls = 0, source;
  await page.route("**/api/evaluations", r => { calls++; const b = r.request().postDataJSON(); source = b.sourceAnalysis; return r.fulfill({ contentType: "application/json", body: envelope(mockEvaluation(b)) }); });
  await explain(page); await page.getByLabel("Explanation text").fill("Glucose stores energy.");
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  await expect(page.getByRole("article", { name: "Explanation feedback" })).toContainText("Glucose stores energy.");
  await expect(page.locator(".status-badge.correct").first()).toBeVisible();
  await expect(page.locator(".status-badge.missing").first()).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(source!.graph.statements.filter((s: { topicId: string }) => s.topicId === source!.graph.topics[0].id).length);
  const edges = await page.locator(".react-flow__edge").evaluateAll(elements => elements.map(e => e.getAttribute("data-id")));
  expect(edges.sort()).toEqual(source!.graph.statements.filter((s: { topicId: string }) => s.topicId === source!.graph.topics[0].id).map((s: { id: string }) => s.id).sort());
  await page.getByRole("button", { name: "Edit and try again" }).click();
  await expect(page.getByLabel("Explanation text")).toHaveValue("Glucose stores energy."); expect(calls).toBe(1);
});
test("mock: evaluation error retains input and retry uses the same analysis and ingestion", async ({ page }) => {
  let calls = 0, first: EvaluateTextRequest;
  await page.route("**/api/evaluations", r => { const b = r.request().postDataJSON(); calls++; if (calls === 1) { first = b; return r.fulfill({ status: 429, contentType: "application/json", body: error }); } expect(b).toEqual(first); return r.fulfill({ contentType: "application/json", body: envelope(mockEvaluation(b)) }); });
  await explain(page); await page.getByLabel("Explanation text").fill("Glucose stores energy.");
  await page.getByRole("button", { name: "Evaluate", exact: true }).click(); await expect(page.locator(".error-message")).toContainText("Mock quota reached.");
  await expect(page.getByLabel("Explanation text")).toHaveValue("Glucose stores energy.");
  await page.getByRole("button", { name: "Evaluate", exact: true }).click(); await expect(page.getByRole("article", { name: "Explanation feedback" })).toBeVisible(); expect(calls).toBe(2);
});
for (const action of ["edit", "reset"] as const) test(`mock: late evaluation cannot overwrite ${action}`, async ({ page }) => {
  let release!: () => void, started!: () => void;
  const signal = new Promise<void>(resolve => started = resolve), pending = new Promise<void>(resolve => release = resolve);
  let calls = 0;
  await page.route("**/api/evaluations", async r => { calls++; const data = mockEvaluation(r.request().postDataJSON()); started(); await pending; await r.fulfill({ contentType: "application/json", body: envelope(data) }).catch(() => {}); });
  await explain(page); await page.getByLabel("Explanation text").fill("Glucose stores energy."); await page.getByRole("button", { name: "Evaluate", exact: true }).click(); await signal;
  await expect(page.getByRole("button", { name: "Evaluating...", exact: false })).toBeDisabled();
  if (action === "edit") await page.getByLabel("Explanation text").fill("New explanation."); else await page.getByRole("button", { name: "Start over" }).click();
  release(); await page.waitForTimeout(250);
  await expect(page.getByRole("article", { name: "Explanation feedback" })).toHaveCount(0);
  if (action === "edit") await expect(page.getByLabel("Explanation text")).toHaveValue("New explanation."); else await expect(page.getByLabel("Paste your learning material")).toHaveValue(""); expect(calls).toBe(1);
});
test("mock: transcript is editable and evaluation submits the edited text", async ({ page }) => {
  await fakeRecording(page);
  await page.route("**/api/transcriptions", r => { expect(r.request().postDataBuffer()?.toString()).toContain('name="audioFile"'); return r.fulfill({ contentType: "application/json", body: envelope(transcript) }); });
  await page.route("**/api/evaluations", r => { const b = r.request().postDataJSON(); expect(b.learner.text).toBe("My edited transcript."); return r.fulfill({ contentType: "application/json", body: envelope(mockEvaluation(b)) }); });
  await explain(page); await record(page); await page.getByRole("button", { name: "Create transcript", exact: true }).click();
  await expect(page.getByLabel("Explanation text")).toHaveValue(transcript.transcript); await page.getByLabel("Explanation text").fill("My edited transcript.");
  await page.getByRole("button", { name: "Evaluate", exact: true }).click(); await expect(page.getByRole("article", { name: "Explanation feedback" })).toContainText("My edited transcript.");
});
test("mock: transcription failure leaves recording and manual text available", async ({ page }) => {
  await fakeRecording(page); await page.route("**/api/transcriptions", r => r.fulfill({ status: 429, contentType: "application/json", body: error }));
  await explain(page); await page.getByLabel("Explanation text").fill("Keep my input."); await record(page); await page.getByRole("button", { name: "Create transcript", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("Mock quota reached."); await expect(page.locator("audio")).toBeVisible(); await expect(page.getByLabel("Explanation text")).toHaveValue("Keep my input."); await expect(page.getByRole("button", { name: "Evaluate", exact: true })).toBeEnabled();
});
test("mock: replacing audio discards a late transcript and keeps typed input", async ({ page }) => {
  await fakeRecording(page); let release!: () => void, started!: () => void;
  const signal = new Promise<void>(resolve => started = resolve), pending = new Promise<void>(resolve => release = resolve);
  await page.route("**/api/transcriptions", async r => { started(); await pending; await r.fulfill({ contentType: "application/json", body: envelope(transcript) }).catch(() => {}); });
  await explain(page); await page.getByLabel("Explanation text").fill("Keep this text."); await record(page); await page.getByRole("button", { name: "Create transcript", exact: true }).click(); await signal;
  await page.getByRole("button", { name: "Delete", exact: true }).click(); await record(page); release(); await page.waitForTimeout(250);
  await expect(page.getByLabel("Explanation text")).toHaveValue("Keep this text."); await expect(page.getByText("Transcript ready", { exact: false })).toHaveCount(0);
});
test("mock: malformed successful transcript is rejected without replacing manual input", async ({ page }) => {
  await fakeRecording(page); await page.route("**/api/transcriptions", r => r.fulfill({ contentType: "application/json", body: envelope({ transcript: "Invented success" }) }));
  await explain(page); await page.getByLabel("Explanation text").fill("Keep my input."); await record(page); await page.getByRole("button", { name: "Create transcript", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("invalid transcript"); await expect(page.getByLabel("Explanation text")).toHaveValue("Keep my input.");
});
test("mock: malformed successful evaluation is rejected without feedback fixture", async ({ page }) => {
  await page.route("**/api/evaluations", r => r.fulfill({ contentType: "application/json", body: envelope({ comparisons: [] }) }));
  await explain(page); await page.getByLabel("Explanation text").fill("Keep my explanation."); await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("invalid references or evidence"); await expect(page.getByLabel("Explanation text")).toHaveValue("Keep my explanation."); await expect(page.getByRole("article", { name: "Explanation feedback" })).toHaveCount(0);
});
for (const file of ["text.pdf", "paragraphs-table.docx"]) test(`real ingestion + mock AI: explanation ${file} becomes editable text`, async ({ page }) => {
  await explain(page); await page.unroute("**/api/sources");
  await page.getByLabel("Upload your explanation").setInputFiles(`tests/sources/fixtures/${file}`); await page.getByRole("button", { name: "Import explanation text", exact: true }).click();
  await expect(page.getByLabel("Explanation text")).not.toHaveValue(""); await expect(page.getByRole("button", { name: "Evaluate", exact: true })).toBeEnabled();
});
