/** Browser replay ONLY: all APIs are intercepted, no new Gemini calls. */
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
test.use({ channel: "chromium" });
for (const scenario of ["synthetic mixed repair", "saved real biology"]) test(`${scenario}: Explanation -> Compare retains feedback and highlights`, async ({ page }, info) => {
  test.skip(scenario === "saved real biology" && !existsSync("test-results/reference-stability/biology-input.json"), "Saved private biology artifacts unavailable; do not fabricate a live replay.");
  const f = scenario.startsWith("synthetic")
    ? JSON.parse(await readFile("test-results/learner-reference-repair/browser-fixture.json", "utf8"))
    : { input: JSON.parse(await readFile("test-results/reference-stability/biology-input.json", "utf8")),
      evaluation: JSON.parse(await readFile("test-results/reference-stability/biology-live-response.json", "utf8")).body.data };
  let analysisCalls = 0, evaluationCalls = 0;
  const envelope = (data: unknown) => ({ ok: true, schemaVersion: "2.0", data });
  await page.route("**/api/**", r => r.abort());
  await page.route("**/api/sources", r => r.fulfill({ json: envelope(f.input.importedSource) }));
  await page.route("**/api/analysis", r => { analysisCalls++; return r.fulfill({ json: envelope(f.input.sourceAnalysis) }); });
  await page.route("**/api/evaluations", async r => {
    evaluationCalls++;
    const request = r.request().postDataJSON();
    expect(request.learner.text).toBe(f.input.learner.text);
    expect(request.sourceAnalysis.id).toBe(f.input.sourceAnalysis.id);
    return r.fulfill({ json: envelope(f.evaluation) });
  });
  const ready = async () => { await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true"); };
  await page.goto("/");
  await page.getByLabel("Paste your learning material").fill(f.input.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await ready();
  await page.getByRole("button", { name: "Write your explanation", exact: true }).click();
  await page.getByLabel("Explanation text").fill(f.input.learner.text);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click(); await ready();
  await page.getByRole("button", { name: "Compare", exact: true }).click(); await ready();
  const comparison = f.evaluation.comparisons.find((c: { learnerStatements: unknown[] }) => c.learnerStatements.length);
  await page.getByLabel("Topic", { exact: true }).selectOption(comparison.topicId); await ready();
  await page.locator(`.relationship-list [data-detail-id="${comparison.id}"]`).click();
  const panel = page.getByRole("complementary", { name: "Comparison details" });
  await expect(panel.locator(".comparison-difference")).toContainText(comparison.explanation);
  await expect(panel).toContainText(comparison.status[0].toUpperCase() + comparison.status.slice(1));
  await expect(page.locator(".react-flow__node.graph-highlight").first()).toBeVisible();
  await expect(page.locator(".react-flow__edge.selected").first()).toBeAttached();
  await page.screenshot({ path: `test-results/learner-reference-repair/replay-${scenario.split(" ")[0]}-${info.project.name}.png`, fullPage: true });
  expect(analysisCalls).toBe(1); expect(evaluationCalls).toBe(1);
});
