/** Live voice only, using a previously saved REAL source analysis in the UI. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateEvaluateTextResponse } from "../src/backend/contracts/validate";
test.skip(process.env.RUN_VOICE_LIVE !== "1", "Explicit live opt-in required; accounts for calls already used in this task.");
test.use({ baseURL: "http://localhost:3000", launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${path.resolve("test-results/spoken-explanation.wav")}`] } });
test("live voice: saved real source -> Chromium recording -> transcript edit -> evaluation", async ({ page }) => {
  test.setTimeout(180_000);
  const saved = JSON.parse(await readFile("test-results/reference-graph-live-audit.json", "utf8"));
  const report = JSON.parse(await readFile("test-results/explanations-live-results.json", "utf8"));
  expect(report.calls).toBeLessThanOrEqual(2);
  const ok = (data: unknown) => JSON.stringify({ ok: true, schemaVersion: "1.0", data });
  // Reuse actual validated data, explicitly replayed; these are not new AI/source calls.
  await page.route("**/api/sources", r => r.fulfill({ contentType: "application/json", body: ok(saved.importedSource) }));
  await page.route("**/api/analysis", r => r.fulfill({ contentType: "application/json", body: ok(saved.analysis) }));
  console.log("Source UI initialized from saved real analysis. Transcription/evaluation use real endpoints.");
  async function checkpoint(response: Awaited<ReturnType<typeof page.waitForResponse>>, operation: string) {
    const result = await response.json(), requestId = response.headers()["x-request-id"];
    const lines = (await readFile(".next/dev/logs/source-analysis.jsonl", "utf8")).split("\n").filter(Boolean).map(s => JSON.parse(s)).filter(e => e.requestId === requestId);
    const generations = lines.filter(e => e.stage === "sdk_request").length;
    report.calls += generations; expect(report.calls).toBeLessThanOrEqual(4);
    const record = { operation, httpStatus: response.status(), requestId, generations, totalCalls: report.calls, code: result.ok ? undefined : result.error?.code,
      metadata: lines.filter(e => ["provider_configured", "upstream_response", "sdk_result"].includes(e.stage)) };
    report.records.push(record); console.log(JSON.stringify(record));
    await writeFile("test-results/explanations-live-results.json", JSON.stringify(report, null, 2));
    await writeFile(`test-results/${operation}-live-response.json`, JSON.stringify(result, null, 2));
    expect(result.ok, `Live ${operation} failed: ${result.error?.code ?? response.status()}`).toBe(true);
    return result;
  }
  await page.goto("/"); await page.waitForLoadState("networkidle"); await page.getByLabel("Paste your learning material").fill(saved.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click(); await expect(page.getByText("Recording from your microphone")).toBeVisible(); await page.waitForTimeout(12_000);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const transcriptResponse = page.waitForResponse(r => r.url().endsWith("/api/transcriptions"), { timeout: 75_000 });
  await page.getByRole("button", { name: "Create transcript", exact: true }).click();
  const transcript = await checkpoint(await transcriptResponse, "transcription");
  await expect(page.getByLabel("Explanation text")).toHaveValue(transcript.data.transcript); expect(transcript.data.transcript).toMatch(/does not|doesn't|not store/i);
  const edited = `${transcript.data.transcript}\nI would like to review the source.`;
  await page.getByLabel("Explanation text").fill(edited); await page.screenshot({ path: "test-results/live-editable-transcript.png", fullPage: true });
  const evaluationResponse = page.waitForResponse(r => r.url().endsWith("/api/evaluations"), { timeout: 75_000 });
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  const response = await evaluationResponse, result = await checkpoint(response, "voice_evaluation");
  expect(response.request().postDataJSON().learner.text).toBe(edited); expect(validateEvaluateTextResponse(response.request().postDataJSON(), result).valid).toBe(true); expect(result.data.sourceAnalysisId).toBe(saved.analysis.id);
  await expect(page.getByRole("article", { name: "Explanation feedback" })).toBeVisible();
  for (const topic of saved.analysis.graph.topics) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    const statement = saved.analysis.graph.statements.find((s: { topicId: string; relation: string }) => s.topicId === topic.id && s.relation === "stores");
    if (statement) { await page.locator(".relationship-list").getByRole("button").filter({ hasText: statement.assertion }).click(); await expect(page.getByRole("article", { name: "Explanation feedback" })).toContainText("Contradicted"); await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText("Glucose stores chemical energy."); }
  }
  await page.screenshot({ path: "test-results/live-voice-feedback.png", fullPage: true });
});
