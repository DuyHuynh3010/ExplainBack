import { test, expect } from "@playwright/test";
import { ANALYSIS_LIMITS } from "../src/backend/analysis/limits";
test.skip(process.env.RUN_GEMINI_UI_SMOKE !== "1", "Live Gemini smoke requires explicit opt-in; normal browser tests mock AI.");
// Match the user-started dev server's origin; recent Next.js blocks cross-origin dev resources.
test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}` });

/** Explicitly opt in on desktop only: one UI request, bounded by backend's two-call budget. */
test("live Gemini: short text -> real source import -> real reference graph and summary", async ({ page }) => {
  test.setTimeout(ANALYSIS_LIMITS.totalTimeoutMs + 30_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Lesson title").fill("Live smoke: photosynthesis");
  await page.getByLabel("Paste your learning material").fill("Photosynthesis takes place in chloroplasts. Chlorophyll absorbs light energy. Plants use carbon dioxide and water to produce glucose and oxygen. Glucose stores chemical energy.");
  await expect(page.locator(".source-meta span").first()).not.toHaveText("0 words");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  page.on("request", request => { if (/\/api\/(sources|analysis)$/.test(request.url())) console.log(JSON.stringify({ stage: "browser_request", path: new URL(request.url()).pathname })); });
  page.on("response", response => { if (/\/api\/(sources|analysis)$/.test(response.url())) console.log(JSON.stringify({ stage: "browser_response", path: new URL(response.url()).pathname, status: response.status(), requestId: response.headers()["x-request-id"] })); });
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/analysis") && r.request().method() === "POST", { timeout: ANALYSIS_LIMITS.totalTimeoutMs + 10_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await responsePromise;
  const result = await response.json();
  // Only controlled error codes or counts are printed; no credentials or raw provider errors.
  if (!result.ok) console.log(JSON.stringify({ liveGemini: false, status: response.status(), code: result.error?.code, requestId: response.headers()["x-request-id"], retryAfter: response.headers()["retry-after"] }));
  expect(result.ok, `Live Gemini failed: ${result.error?.code ?? response.status()}`).toBe(true);
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Topic summary" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Source relationship details" })).toBeVisible();
  expect(result.data.provenance).toBe("analysis");
  for (const topic of result.data.graph.topics) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    const section = result.data.lessonSections.find((s: { topicId: string }) => s.topicId === topic.id);
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(section.summary);
    const statements = result.data.graph.statements.filter((s: { topicId: string }) => s.topicId === topic.id);
    expect(statements.length).toBeGreaterThan(0);
    const statement = statements.at(-1);
    await page.locator(".relationship-list").getByRole("button").filter({ hasText: statement.assertion }).click();
    const evidence = result.data.graph.evidence.find((e: { id: string }) => e.id === statement.evidenceIds[0]);
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(evidence.quote);
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
  }
  console.log(JSON.stringify({ liveGemini: true, topics: result.data.graph.topics.length, statements: result.data.graph.statements.length }));
  await page.screenshot({ path: "test-results/live-source-analysis.png", fullPage: true });
});
