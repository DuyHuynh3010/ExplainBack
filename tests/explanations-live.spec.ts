/** Explicit live opt-in. Sequential; max four generations including source repair. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateEvaluateTextResponse } from "../src/backend/contracts/validate";
test.skip(process.env.RUN_EXPLANATION_LIVE !== "1", "Requires explicit live opt-in and a prepared synthetic speech WAV.");
test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}`, launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${path.resolve("test-results/spoken-explanation.wav")}`] } });

test("live: source -> text evaluation -> editable voice transcript -> voice evaluation", async ({ page }) => {
  test.setTimeout(360_000);
  let calls = 0;
  const records: unknown[] = [];
  async function checkpoint(response: Awaited<ReturnType<typeof page.waitForResponse>>, operation: string) {
    const result = await response.json(), requestId = response.headers()["x-request-id"];
    const lines = (await readFile(".next/dev/logs/source-analysis.jsonl", "utf8")).split("\n").filter(Boolean).map(s => JSON.parse(s)).filter(e => e.requestId === requestId);
    const generations = lines.filter(e => e.stage === "sdk_request").length;
    calls += generations;
    expect(calls).toBeLessThanOrEqual(4);
    const record = { operation, httpStatus: response.status(), requestId, generations, totalCalls: calls, code: result.ok ? undefined : result.error?.code,
      metadata: lines.filter(e => ["provider_configured", "upstream_response", "sdk_result"].includes(e.stage)) };
    records.push(record); console.log(JSON.stringify(record));
    await writeFile("test-results/explanations-live-results.json", JSON.stringify({ calls, records }, null, 2));
    // Any failure stops this single live test. No Playwright retries are allowed.
    expect(result.ok, `Live ${operation} failed: ${result.error?.code ?? response.status()}`).toBe(true);
    return result;
  }
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Lesson title").fill("Live explanation smoke");
  await page.getByLabel("Paste your learning material").fill("Photosynthesis produces glucose and oxygen. Glucose stores chemical energy. Chlorophyll absorbs light energy.");
  const sourceResponse = page.waitForResponse(r => r.url().endsWith("/api/analysis") && r.request().method() === "POST", { timeout: 135_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const source = await checkpoint(await sourceResponse, "analysis");
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill("Photosynthesis makes glucose and oxygen. Glucose does not store chemical energy. Chlorophyll absorbs light energy. Plants look beautiful.");
  const evaluationResponse = page.waitForResponse(r => r.url().endsWith("/api/evaluations"), { timeout: 75_000 });
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  const response = await evaluationResponse;
  const evaluation = await checkpoint(response, "text_evaluation");
  expect(validateEvaluateTextResponse(response.request().postDataJSON(), evaluation).valid).toBe(true);
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("article", { name: "Explanation feedback" })).toBeVisible();
  for (const topic of source.data.graph.topics) { await page.getByLabel("Topic", { exact: true }).selectOption(topic.id); await expect(page.getByRole("heading", { name: "Compare graphs", exact: true })).toBeVisible(); }
  await page.screenshot({ path: "test-results/live-text-feedback.png", fullPage: true });
  await page.getByRole("button", { name: "Review flashcards" }).click();
  await page.getByRole("button", { name: "Explain again" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByText("Recording from your microphone")).toBeVisible();
  await page.waitForTimeout(12_000);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const transcriptionResponse = page.waitForResponse(r => r.url().endsWith("/api/transcriptions"), { timeout: 75_000 });
  await page.getByRole("button", { name: "Create transcript", exact: true }).click();
  const transcription = await checkpoint(await transcriptionResponse, "transcription");
  await expect(page.getByLabel("Explanation text")).toHaveValue(transcription.data.transcript);
  expect(transcription.data.transcript).toMatch(/does not|doesn't|not store/i);
  const edited = `${transcription.data.transcript}\nI would like to review the source.`;
  await page.getByLabel("Explanation text").fill(edited);
  await page.screenshot({ path: "test-results/live-editable-transcript.png", fullPage: true });
  if (calls >= 4) { console.log("Voice evaluation not attempted: four-generation budget exhausted."); return; }
  const finalResponse = page.waitForResponse(r => r.url().endsWith("/api/evaluations"), { timeout: 75_000 });
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  const final = await finalResponse, voiceEvaluation = await checkpoint(final, "voice_evaluation");
  expect(final.request().postDataJSON().learner.text).toBe(edited);
  expect(validateEvaluateTextResponse(final.request().postDataJSON(), voiceEvaluation).valid).toBe(true);
  expect(voiceEvaluation.data.sourceAnalysisId).toBe(source.data.id);
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("article", { name: "Explanation feedback" })).toBeVisible();
  await page.screenshot({ path: "test-results/live-voice-feedback.png", fullPage: true });
});
