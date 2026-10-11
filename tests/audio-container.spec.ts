/** Offline real browser container check. AI endpoints are intercepted. */
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { importText } from "../src/backend/sources/ingest";
import { mockAnalysis } from "./ui-source-fixture";
test.skip(process.env.RUN_AUDIO_CONTAINER_SMOKE !== "1", "Requires an offline synthetic speech WAV in test-results.");
test.use({ baseURL: "http://localhost:3000", launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${path.resolve("test-results/spoken-explanation.wav")}`] } });
test("offline: capture the actual Chromium WebM recording for container regression", async ({ page }) => {
  const source = importText("Glucose stores energy.");
  const ok = (data: unknown) => JSON.stringify({ ok: true, schemaVersion: "2.0", data });
  await page.route("**/api/sources", r => r.fulfill({ contentType: "application/json", body: ok(source) }));
  await page.route("**/api/analysis", r => r.fulfill({ contentType: "application/json", body: ok(mockAnalysis(source)) }));
  await page.route("**/api/transcriptions", async r => {
    const form = await new Response(r.request().postDataBuffer()! as BodyInit, { headers: { "content-type": r.request().headers()["content-type"] } }).formData();
    const file = form.get("audioFile") as File;
    await writeFile("test-results/browser-recording.webm", Buffer.from(await file.arrayBuffer()));
    await r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, schemaVersion: "2.0", error: { code: "INVALID_REQUEST", message: "Offline container capture: no AI call.", retryable: false } }) });
  });
  await page.goto("/"); await page.waitForLoadState("networkidle"); await page.getByLabel("Paste your learning material").fill("Glucose stores energy.");
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click(); await page.waitForTimeout(2500); await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Create transcript", exact: true }).click(); await expect(page.locator(".error-message")).toContainText("Offline container capture");
});
