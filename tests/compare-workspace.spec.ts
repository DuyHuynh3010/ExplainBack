/** Fully offline UI verification. All API requests mocked; backend AI also transport-blocked. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const dir = "test-results/compare-workspace";
test.use({ channel: "chromium" });
const envelope = (data: unknown) => ({ ok: true, schemaVersion: "2.0", data });
async function ready(page: Page) { await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true"); }
async function viewport(page: Page) { return page.locator(".react-flow__viewport").evaluate(e => { const m = new DOMMatrix(getComputedStyle(e).transform); return { x: m.e, y: m.f, zoom: m.a }; }); }
async function setup(page: Page) {
  const f = JSON.parse(await readFile(`${dir}/fixture.json`, "utf8")); let calls = 0;
  await page.route("**/api/**", r => r.abort());
  await page.route("**/api/sources", r => r.fulfill({ json: envelope(f.importedSource) }));
  await page.route("**/api/analysis", r => { calls++; return r.fulfill({ json: envelope(f.analysis) }); });
  await page.route("**/api/evaluations", r => { calls++; return r.fulfill({ json: envelope(f.evaluation) }); });
  await page.goto("/");
  await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Write your explanation", exact: true }).click();
  await page.getByLabel("Explanation text").fill(f.input.learner.text);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Compare", exact: true }).click(); await ready(page);
  return { f, calls: () => calls };
}
async function choose(page: Page, id: string) { await page.locator(`.relationship-list [data-detail-id="${id}"]`).click(); }

test("contradicted formula focuses both genuine claims; one readable panel and correct provenance", async ({ page }, info) => {
  const { f, calls } = await setup(page), comparison = f.evaluation.comparisons[0];
  await choose(page, comparison.id);
  const panel = page.getByRole("complementary", { name: "Comparison details" });
  await expect(panel).toHaveCount(1); await expect(panel).toContainText("Contradicted");
  await expect(panel.locator(".comparison-side").first()).toContainText("|A| + |B| - |A intersection B|");
  await expect(panel.locator(".comparison-side").nth(1)).toContainText("|A| + |B| + |A intersection B|");
  await expect(panel.locator(".comparison-difference")).toContainText(comparison.explanation);
  await expect(panel.getByText(comparison.explanation, { exact: true })).toHaveCount(1);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(2);
  await expect(page.locator(".react-flow__node.graph-highlight")).toHaveCount(3);
  await expect(page.locator(`.reference-edge-label[data-comparison-id="${comparison.id}"][data-origin="lesson"]`)).not.toContainText("Contradicted");
  await expect.poll(async () => (await viewport(page)).zoom).toBeGreaterThanOrEqual(0.65);
  // Wait for the bounded pair-focus animation, not merely an already-readable zoom.
  await expect.poll(async () => {
    const canvas = (await page.getByLabel("Source concept map").boundingBox())!;
    const boxes = await Promise.all((await page.locator(".react-flow__node.graph-highlight").all()).map(n => n.boundingBox()));
    return boxes.every(box => box && box.x >= canvas.x-2 && box.x+box.width <= canvas.x+canvas.width+2 && box.y >= canvas.y-2 && box.y+box.height <= canvas.y+canvas.height+2);
  }).toBe(true);
  await page.screenshot({ path: `${dir}/contradicted-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(0);
  await expect(page.locator(".react-flow__node.graph-dim")).toHaveCount(0);
  expect(calls()).toBe(2);
});

test("all statuses, missing, additional and complex mismatch retain the original sides", async ({ page }) => {
  const { f, calls } = await setup(page);
  const panel = page.getByRole("complementary", { name: "Comparison details" });
  for (const c of f.evaluation.comparisons) {
    await choose(page, c.id); await expect(panel.locator(".card-heading .status-badge")).toContainText(c.status[0].toUpperCase()+c.status.slice(1));
    await expect(panel.locator(".comparison-difference")).toContainText(c.explanation);
    if (c.status === "missing") {
      await expect(panel).toContainText("Not mentioned in your explanation");
      await expect(panel.locator(".comparison-side").nth(1).locator("blockquote")).toHaveCount(0);
    }
  }
  await choose(page, f.evaluation.comparisons[3].id);
  await expect(page.locator(".react-flow__node.graph-highlight .knowledge-node.relation")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(6);
  await expect(page.locator(".reference-edge-label .status-badge.contradicted")).toHaveCount(1); // Only the binary formula, not six role errors.
  const idea = f.evaluation.additionalIdeas[0];
  const claimId = idea.learnerStatements[0].statementId;
  await choose(page, `additional:${claimId}`);
  await expect(panel).toContainText("No linked reference claim"); await expect(panel).toContainText(idea.explanation);
  await expect(panel.locator(".status-badge")).toHaveCount(0);
  expect(calls()).toBe(2);
});

test("native fullscreen uses only persistent workspace; preserves view, topic, selection and viewport", async ({ page }, info) => {
  const { f, calls } = await setup(page);
  await choose(page, f.evaluation.comparisons[0].id);
  await page.waitForTimeout(350);
  const before = await viewport(page), topic = await page.getByLabel("Topic", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Expand graph", exact: true }).click();
  const workspace = page.locator("[data-graph-workspace]");
  await expect(workspace).toHaveAttribute("data-fullscreen-mode", "native");
  expect(await page.evaluate(() => document.fullscreenElement?.hasAttribute("data-graph-workspace"))).toBe(true);
  await expect(workspace.locator(".lesson-summary,.relationship-list,.card-bottom,.analysis-warnings,.view-heading")).toHaveCount(0);
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(topic);
  expect(await viewport(page)).toEqual(before);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(2);
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await expect(page.locator("#graph-details")).toBeHidden();
  await page.screenshot({ path: `${dir}/fullscreen-canvas-${info.project.name}.png` });
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(page.locator("#graph-details")).toBeVisible();
  await page.screenshot({ path: `${dir}/fullscreen-${info.project.name}.png` });
  for (const view of ["Lesson", "Explanation", "Compare"]) {
    await page.getByRole("button", { name: view, exact: true }).click(); await ready(page);
    expect(await page.evaluate(() => document.fullscreenElement?.hasAttribute("data-graph-workspace"))).toBe(true);
    const current = await page.getByLabel("Topic", { exact: true }).inputValue();
    await page.getByLabel("Topic", { exact: true }).selectOption(f.analysis.graph.topics[1].id); await ready(page);
    await page.getByLabel("Topic", { exact: true }).selectOption(current); await ready(page);
  }
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await expect(workspace).toHaveAttribute("data-fullscreen-mode", "inline");
  await page.getByRole("button", { name: "Expand graph", exact: true }).click();
  await page.keyboard.press("Escape");
  // App Escape handler supplements browser-owned native Escape, and fullscreenchange synchronizes external exits.
  await expect(workspace).toHaveAttribute("data-fullscreen-mode", "inline");
  expect(calls()).toBe(2);
});

test("unsupported overlay, denied request and wheel/panel scrolling are isolated from the page", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: undefined }));
  const { f, calls } = await setup(page);
  await choose(page, f.evaluation.comparisons[0].id);
  for (const view of ["Lesson", "Explanation", "Compare"]) {
    await page.getByRole("button", { name: view, exact: true }).click(); await ready(page);
    await page.getByRole("button", { name: "Expand graph", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveAttribute("data-fullscreen-mode", "overlay");
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.getByRole("button", { name: "Hide details", exact: true }).click();
    const canvas = (await page.getByLabel("Source concept map").boundingBox())!, start = await viewport(page);
    const cursor = { x: canvas.x + canvas.width * .3, y: canvas.y + canvas.height * .3 };
    await page.mouse.move(cursor.x, cursor.y); await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await viewport(page)).zoom).toBeGreaterThan(start.zoom);
    const zoomed = await viewport(page), local = { x: cursor.x-canvas.x, y: cursor.y-canvas.y };
    expect(Math.abs((local.x-start.x)/start.zoom-(local.x-zoomed.x)/zoomed.zoom)).toBeLessThan(2);
    expect(Math.abs((local.y-start.y)/start.zoom-(local.y-zoomed.y)/zoomed.zoom)).toBeLessThan(2);
    const pane = (await page.locator(".react-flow__pane").boundingBox())!;
    await page.mouse.move(pane.x+8,pane.y+8); await page.mouse.down(); await page.mouse.move(pane.x+55,pane.y+35,{steps:8}); await page.mouse.up();
    await expect.poll(async () => (await viewport(page)).x).not.toBe(zoomed.x);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    const panel = page.locator("#graph-details");
    for (const details of await panel.locator("details").all()) await details.evaluate(e => { (e as HTMLDetailsElement).open = true; });
    const box = (await panel.boundingBox())!, previous = await viewport(page);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.wheel(0,400);
    if (await panel.evaluate(e=>e.scrollHeight>e.clientHeight)) await expect.poll(()=>panel.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
    expect(await viewport(page)).toEqual(previous);
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.evaluate(() => Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: () => Promise.reject(new Error("Test denial")) }));
  await page.getByRole("button", { name: "Expand graph", exact: true }).click();
  await expect(page.locator(".graph-explorer-controls [role=alert]")).toContainText("browser denied fullscreen");
  await expect(page.getByRole("dialog")).toHaveCount(0); expect(calls()).toBe(2);
});
