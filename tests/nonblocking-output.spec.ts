/** Real handlers with injected offline providers; browser/client/adapter are real. */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { handleAnalysisRequest } from "../src/backend/analysis/handler";
import { handleEvaluationRequest } from "../src/backend/explanations/evaluation";
import type { AnalysisProvider } from "../src/backend/analysis/provider";
import type { ImportedSource } from "../src/backend/contracts/domain";

test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}`, channel: "chromium" });
type Case = { name: string; importedSource: ImportedSource; sourceDraft: unknown; evaluationDraft: unknown; learnerText: string };
const cases = JSON.parse(readFileSync("tests/analysis/fixtures/nonblocking-output.json", "utf8")) as Case[];
for (const fixture of cases) test(`${fixture.name}: Lesson -> Explanation -> Compare renders without quality rejection`, async ({ page }, info) => {
  const errors: string[] = [], calls = { analysis: 0, evaluation: 0, requests: 0 };
  page.on("pageerror", e => errors.push(e.message));
  const provider = (kind: "analysis" | "evaluation", draft: unknown): AnalysisProvider => ({ generate: async () => {
    calls[kind]++; return { text: JSON.stringify(draft), finishReason: "stop" };
  } });
  await page.route("**/api/**", async route => {
    calls.requests++;
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/sources") return route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: fixture.importedSource } });
    const request = new Request(route.request().url(), { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
    const response = path === "/api/analysis" ? await handleAnalysisRequest(request, () => provider("analysis", fixture.sourceDraft))
      : path === "/api/evaluations" ? await handleEvaluationRequest(request, provider("evaluation", fixture.evaluationDraft)) : undefined;
    if (!response) return route.abort();
    expect(response.status).toBe(200);
    await route.fulfill({ status: response.status, json: await response.json() });
  });
  await page.goto("/"); await page.waitForLoadState("networkidle");
  const inspectCanvas = async (panel: string) => {
    await page.getByRole("button", { name: "Fit graph", exact: true }).click();
    const concept = page.locator(".knowledge-node.concept").first();
    if (await concept.count()) { await concept.click(); await expect(page.locator(".react-flow__node.graph-highlight")).not.toHaveCount(0); }
    const card = page.locator(".knowledge-node.relation").first();
    if (await card.count()) { await card.click(); await expect(page.getByRole("complementary", { name: panel })).toBeVisible(); }
    // Compare focuses a selected card and its counterpart. Restore the whole
    // viewport before clicking an unrelated edge rather than clicking outside it.
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    await page.getByRole("button", { name: "Fit graph", exact: true }).click();
    const edge = page.locator(".reference-edge-label:not(.graph-label-measure)").first();
    if (await edge.count()) { await edge.click(); await expect(page.getByRole("complementary", { name: panel })).toBeVisible(); }
  };
  await page.getByLabel("Paste your learning material").fill(fixture.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const canvas = page.getByLabel("Source concept map"), topic = page.getByLabel("Topic", { exact: true });
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await topic.selectOption("__all__"); await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".react-flow__node")).not.toHaveCount(0);
  await inspectCanvas("Source relationship details");
  const lessonRows = page.locator(".relationship-list [data-statement-id]");
  for (let i = 0; i < await lessonRows.count(); i++) {
    const row = lessonRows.nth(i), assertion = await row.locator("span").first().textContent();
    await row.click();
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(assertion!);
    await expect(page.locator(".react-flow__node.graph-highlight")).not.toHaveCount(0);
  }
  await expect(page.locator(".review-notes")).toHaveCount(0);
  await expect(page.locator(".request-message.error-message")).toHaveCount(0);
  await page.getByRole("button", { name: "Write your explanation", exact: true }).click();
  await page.getByLabel("Explanation text").fill(fixture.learnerText);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  const learnerRows = page.locator(".relationship-list [data-detail-id]");
  await inspectCanvas("Explanation statement details");
  const learnerCount = await learnerRows.count(); expect(learnerCount).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < learnerCount; i++) {
    const assertion = await learnerRows.nth(i).locator("span").first().textContent();
    await learnerRows.nth(i).click();
    await expect(page.getByRole("complementary", { name: "Explanation statement details" })).toContainText(assertion!);
    await expect(page.locator(".react-flow__node.graph-highlight")).not.toHaveCount(0);
  }
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  expect(await topic.inputValue()).toBe("__all__");
  await inspectCanvas("Comparison details");
  const comparisonRows = page.locator(".relationship-list [data-detail-id]");
  for (let i = 0; i < await comparisonRows.count(); i++) {
    await comparisonRows.nth(i).click();
    await expect(page.getByRole("complementary", { name: "Comparison details" })).toBeVisible();
    await expect(page.locator(".react-flow__node.graph-highlight")).not.toHaveCount(0);
  }
  if (["unclassified_learner_claim", "combined", "missing_endpoints_duplicate_ids_evidence"].includes(fixture.name)) await expect(page.locator(".relationship-list")).toContainText("Not compared");
  const apiCount = calls.requests;
  const options = await topic.locator("option").evaluateAll(options => options.map(o => (o as HTMLOptionElement).value).filter(v => !v.startsWith("__")));
  for (const id of options) { await topic.selectOption(id); await expect(canvas).toHaveAttribute("data-layout-ready", "true"); }
  await topic.selectOption("__all__"); await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: "Lesson", exact: true }).click();
  await topic.selectOption("__all__"); await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: "Expand graph", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  if (fixture.name === "combined") await page.screenshot({ path: `.explainback-artifacts/nonblocking-output/combined-${info.project.name}.png` });
  await page.evaluate(() => document.exitFullscreen());
  expect(calls).toEqual({ analysis: 1, evaluation: 1, requests: apiCount });
  expect(errors).toEqual([]);
  await expect(page.locator(".review-notes,.request-message.error-message")).toHaveCount(0);
});
