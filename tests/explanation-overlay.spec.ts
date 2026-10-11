/** Synthetic pipeline candidates, never a live semantic-quality claim. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { SourceAnalysis, EvaluationResult } from "../src/backend/contracts/domain";
const envelope = (data: unknown) => ({ ok: true, schemaVersion: "2.0", data });
async function setup(page: Page, additional = false, failFirst = false) {
  const f = JSON.parse(await readFile("test-results/explanation-overlay/offline.json", "utf8"));
  const input = additional ? f.input : f.exactInput, evaluation = (additional ? f.evaluation : f.exactEvaluation) as EvaluationResult;
  let calls = 0;
  await page.route("**/api/sources", r => r.fulfill({ json: envelope(f.importedSource) }));
  await page.route("**/api/analysis", r => r.fulfill({ json: envelope(f.analysis) }));
  await page.route("**/api/transcriptions", r => r.fulfill({ status: 503, json: { ok: false, schemaVersion: "2.0", error: { code: "AI_NOT_CONFIGURED", message: "Mock-only test.", retryable: false } } }));
  await page.route("**/api/evaluations", r => {
    calls++; const body = r.request().postDataJSON(); expect(body.sourceAnalysis).toEqual(f.analysis); expect(body.importedSource).toEqual(f.importedSource); expect(body.learner.text).toBe(input.learner.text);
    if (failFirst && calls === 1) return r.fulfill({ status: 502, json: { ok: false, schemaVersion: "2.0", error: { code: "AI_OUTPUT_INVALID", message: "Test-only validation error.", retryable: false, details: [{ path: "$.data.learnerGraph.statements[0].representation", message: "Validation rule: invariant." }] } } });
    return r.fulfill({ json: envelope(evaluation) });
  });
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill(input.learner.text);
  return { analysis: f.analysis as SourceAnalysis, evaluation, input, calls: () => calls };
}
async function ready(page: Page) { await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true"); }
async function boxes(page: Page) {
  const rects = await page.locator(".react-flow__node").evaluateAll(nodes => nodes.map(n => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }));
  for (const [i, a] of rects.entries()) for (const b of rects.slice(i + 1)) expect(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1).toBe(true);
}
test("exact reordered explanation -> own graph -> one overlay with opposing assertions, neutral lesson and cached Compare", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const f = await setup(page);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toBeVisible(); await ready(page);
  await expect(page.locator(".map-card .small-label")).toContainText("7 EXPLANATION CLAIMS");
  await expect(page.locator(".relationship-list")).toContainText("Chlorophyll absorbs green light instead of reflecting it.");
  await expect(page.locator(".react-flow__edge")).toHaveCount(13);
  await expect(page.locator(".status-badge")).toHaveCount(0);
  const light = f.analysis.graph.topics.find(t => t.title === "Chlorophyll")!;
  await page.getByLabel("Topic", { exact: true }).selectOption(light.id); await ready(page);
  await page.getByRole("button", { name: "Fit graph", exact: true }).click(); await page.waitForTimeout(350);
  await page.screenshot({ path: `test-results/explanation-overlay/explanation-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Compare", exact: true }).click(); await ready(page);
  await expect(page.locator(".react-flow")).toHaveCount(1);
  await page.getByLabel("Topic", { exact: true }).selectOption(light.id); await ready(page);
  const green = f.analysis.graph.statements.find(s => s.assertion === "Chlorophyll reflects green light.")!;
  const c = f.evaluation.comparisons.find(c => c.referenceRelationshipId === green.id)!;
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.locator(`[data-detail-id="${c.id}"]`).click();
  await expect(page.getByRole("complementary", { name: "Comparison details" })).toContainText("Contradicted");
  await expect(page.getByRole("complementary", { name: "Comparison details" })).toContainText("absorbs green light instead of reflecting");
  await expect(page.getByRole("complementary", { name: "Comparison details" })).toContainText("reflects green light");
  await expect.poll(async () => (await page.locator(".react-flow__viewport").getAttribute("style")) !== before).toBe(true);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(2);
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Expand graph" }).click();
  await boxes(page);
  await page.screenshot({ path: `test-results/explanation-overlay/contradicted-${info.project.name}.png`, fullPage: true });
  await page.getByRole("dialog").evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: `test-results/explanation-overlay/overlay-graph-${info.project.name}.png`, fullPage: true });
  for (const topic of f.analysis.graph.topics) { await page.getByLabel("Topic", { exact: true }).selectOption(topic.id); await ready(page); await boxes(page); }
  await page.getByRole("button", { name: "Lesson", exact: true }).click(); await ready(page);
  await expect(page.getByRole("heading", { name: "Reference graph", exact: true })).toBeVisible();
  await expect(page.locator(".status-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Explanation", exact: true }).click(); await ready(page);
  // Native browser chrome owns Escape; emulate external exit for headless automation.
  await page.evaluate(() => document.exitFullscreen()); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit and try again" }).click();
  await expect(page.getByLabel("Explanation text")).toHaveValue(f.input.learner.text);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Compare", exact: true }).click(); await ready(page);
  expect(f.calls()).toBe(1); expect(errors).toEqual([]);
});
test("validation failure keeps lesson/input, reports path/rule, retries, and additional ideas remain ungraded", async ({ page }, info) => {
  const f = await setup(page, true, true);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("$.data.learnerGraph.statements[0].representation");
  await expect(page.getByLabel("Explanation text")).toHaveValue(f.input.learner.text);
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByLabel("Topic", { exact: true }).selectOption("__additional__"); await ready(page);
  await expect(page.locator(".relationship-list")).toContainText("Some plants have medicinal uses.");
  await expect(page.locator(".status-badge")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Comparison details" })).toContainText("not automatically wrong");
  await page.getByRole("button", { name: "Fit graph", exact: true }).click(); await page.waitForTimeout(350); await boxes(page);
  await page.screenshot({ path: `test-results/explanation-overlay/additional-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByLabel("Paste your learning material")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Compare graphs", exact: true })).toHaveCount(0); expect(f.calls()).toBe(2);
});
