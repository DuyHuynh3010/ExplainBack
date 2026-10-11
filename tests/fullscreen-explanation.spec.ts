/** AI endpoints are mocked except the explicit, guarded exact-case live test. */
import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const dir = "test-results/fullscreen-explanation";
test.use({ channel: "chromium" }); // Exercise the complete browser's fullscreen implementation.
const envelope = (data: unknown) => ({ ok: true, schemaVersion: "2.0", data });
async function ready(page: Page) { await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true"); }
async function setup(page: Page) {
  const f = JSON.parse(await readFile("test-results/explanation-overlay/offline.json", "utf8"));
  let calls = 0;
  await page.route("**/api/sources", r => r.fulfill({ json: envelope(f.importedSource) }));
  await page.route("**/api/analysis", r => { calls++; return r.fulfill({ json: envelope(f.analysis) }); });
  await page.route("**/api/evaluations", r => { calls++; return r.fulfill({ json: envelope(f.exactEvaluation) }); });
  await page.route("**/api/transcriptions", r => r.abort());
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill(f.exactInput.learner.text);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click(); await ready(page);
  return { f, calls: () => calls };
}
async function transform(page: Page) {
  return page.locator(".react-flow__viewport").evaluate(el => {
    const m = new DOMMatrix(getComputedStyle(el).transform); return { x: m.e, y: m.f, zoom: m.a };
  });
}
test("native fullscreen, external fullscreenchange, wheel anchor/pan and controls work in all three views", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const f = await setup(page);
  for (const name of ["Lesson", "Explanation", "Compare"]) {
    await page.getByRole("button", { name, exact: true }).click(); await ready(page);
    const topic = await page.getByLabel("Topic", { exact: true }).inputValue();
    const selector = name === "Lesson" ? "[data-statement-id]" : "[data-detail-id]";
    const row = page.locator(`.relationship-list ${selector}`).first(); await row.click();
    const id = await row.getAttribute(name === "Lesson" ? "data-statement-id" : "data-detail-id");
    await page.waitForTimeout(350); // Let explicit comparison focus complete before checking fullscreen preservation.
    const before = await transform(page);
    await page.getByRole("button", { name: "Expand graph" }).click();
    await expect(page.locator('[data-fullscreen-mode="native"]')).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement?.getAttribute("data-fullscreen-mode"))).toBe("native");
    await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(topic);
    await expect(page.locator(`.relationship-list ${selector}`).first()).toHaveAttribute("aria-pressed", "true");
    expect(await row.getAttribute(name === "Lesson" ? "data-statement-id" : "data-detail-id")).toBe(id);
    expect(await transform(page)).toEqual(before);
    if (await page.getByRole("button", { name: "Hide details", exact: true }).count()) await page.getByRole("button", { name: "Hide details", exact: true }).click();
    const canvas = page.getByLabel("Source concept map"), box = (await canvas.boundingBox())!;
    const cursor = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.45 };
    await page.mouse.move(cursor.x, cursor.y);
    const start = await transform(page), scroll = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await transform(page)).zoom).toBeGreaterThan(start.zoom);
    const zoomed = await transform(page);
    const local = { x: cursor.x - box.x, y: cursor.y - box.y };
    expect(Math.abs((local.x - start.x) / start.zoom - (local.x - zoomed.x) / zoomed.zoom)).toBeLessThan(2);
    expect(Math.abs((local.y - start.y) / start.zoom - (local.y - zoomed.y) / zoomed.zoom)).toBeLessThan(2);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await transform(page)).zoom).toBeLessThan(zoomed.zoom);
    // Find actual bare pane background; responsive layout may put a node at a corner.
    const pane = page.locator(".react-flow__pane"), pb = (await pane.boundingBox())!;
    const point = await pane.evaluate(el => {
      const b = el.getBoundingClientRect();
      for (let y=20;y<b.height/2;y+=30) for(let x=20;x<b.width-80;x+=30) {
        if(document.elementFromPoint(b.x+x,b.y+y) === el) return { x:b.x+x,y:b.y+y };
      }
      return null;
    });
    expect(point).not.toBeNull();
    const panStart = await transform(page);
    await page.mouse.move(point!.x, point!.y); await page.mouse.down();
    await page.mouse.move(point!.x + 60, point!.y + 35, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => (await transform(page)).x).not.toBe(panStart.x);
    expect((await transform(page)).zoom).toBeCloseTo(panStart.zoom, 4);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.getByRole("button", { name: "Fit graph", exact: true }).click(); await page.waitForTimeout(350);
    if (name === "Compare") await page.screenshot({ path: `${dir}/native-${info.project.name}.png` });
    // Browser handles Escape. Headless Playwright does not reliably emulate browser chrome.
    if (name === "Lesson") await page.evaluate(() => document.exitFullscreen());
    else await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await expect(page.locator('[data-fullscreen-mode="inline"]')).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(topic);
  }
  expect(f.calls()).toBe(2); expect(errors).toEqual([]);
});
test("unsupported fullscreen falls back to overlay with Escape; denial is visible without fake fullscreen", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: undefined }));
  const f = await setup(page);
  for (const name of ["Lesson", "Explanation", "Compare"]) {
    await page.getByRole("button", { name, exact: true }).click(); await ready(page);
    await page.getByRole("button", { name: "Expand graph" }).click();
    await expect(page.locator('[data-fullscreen-mode="overlay"]')).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.evaluate(() => Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: () => Promise.reject(new Error("Controlled denial")) }));
  await page.getByRole("button", { name: "Expand graph" }).click();
  await expect(page.locator(".graph-explorer-controls [role=alert]")).toContainText("browser denied fullscreen");
  await expect(page.getByRole("dialog")).toHaveCount(0); expect(f.calls()).toBe(2);
});
test("panel and page scrolling remain available outside the canvas", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Compare", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Expand graph" }).click();
  await expect(page.locator('[data-fullscreen-mode="native"]')).toBeVisible();
  await page.waitForTimeout(350); // Allow Chromium's native fullscreen transition to finish.
  const panel = page.locator(".graph-expanded .results-layout > div").last();
  const panelBox = (await panel.boundingBox())!;
  const hasOverflow = await panel.evaluate(e => e.scrollHeight > e.clientHeight);
  if (hasOverflow) {
    await panel.evaluate(e => { e.scrollTop = 0; });
    await page.mouse.move(panelBox.x + panelBox.width / 2, Math.min(750, panelBox.y + 50));
    await page.mouse.wheel(0, 250); await expect.poll(() => panel.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  } else {
    // A compact panel needs no scroll; its wheel must not zoom the canvas.
    const before = await transform(page);
    await page.mouse.move(panelBox.x+panelBox.width/2,panelBox.y+panelBox.height/2);
    await page.mouse.wheel(0,250);
    expect(await transform(page)).toEqual(before);
  }
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.evaluate(() => scrollTo(0, 0)); await page.mouse.move(8, 300); await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});
test("LIVE exact reordered math explanation with saved real three-topic Lesson", async ({ page }, info) => {
  test.skip(process.env.FULLSCREEN_EXPLANATION_LIVE !== "1" || info.project.name !== "desktop", "Explicit guarded single live evaluation only.");
  test.setTimeout(120000);
  const input = JSON.parse(await readFile(`${dir}/input.json`, "utf8"));
  const baseline = JSON.parse(await readFile(`${dir}/ai-budget.json`, "utf8"));
  expect(baseline.calls).toBeLessThan(4); expect(baseline.stopped).toBe(false);
  await page.route("**/api/sources", r => r.fulfill({ json: envelope(input.importedSource) }));
  await page.route("**/api/analysis", r => r.fulfill({ json: envelope(input.sourceAnalysis) }));
  await page.route("**/api/transcriptions", r => r.abort());
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(input.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await ready(page);
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill(input.learner.text);
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/evaluations"), { timeout: 95000 });
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  const response = await responsePromise, body = await response.json();
  await writeFile(`${dir}/ui-response.json`, JSON.stringify({ status: response.status(), body }, null, 2));
  expect(response.request().postDataJSON().learner.text).toBe(input.learner.text);
  expect(response.status(), JSON.stringify(body.error)).toBe(200);
  await writeFile(`${dir}/accepted-response.json`, JSON.stringify({ status: response.status(), body }, null, 2));
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toBeVisible(); await ready(page);
  await page.screenshot({ path: `${dir}/live-explanation.png`, fullPage: true });
  const claims = body.data.learnerGraph.statements;
  expect(claims.some((s: { assertion: string }) => /exactly two simple paths/.test(s.assertion))).toBe(true);
  expect(claims.some((s: { assertion: string; negated: boolean }) => /not sure/.test(s.assertion) && !s.negated)).toBe(true);
  await page.getByRole("button", { name: "Compare", exact: true }).click(); await ready(page);
  const references = input.sourceAnalysis.graph.statements.map((s: { id: string }) => s.id);
  expect(body.data.comparisons.map((c: { referenceRelationshipId: string }) => c.referenceRelationshipId).sort()).toEqual(references.sort());
  await page.getByLabel("Topic", { exact: true }).selectOption("__additional__"); await ready(page);
  await expect(page.locator(".relationship-list")).toContainText(/tree|graph|equivalence|Antisymmetry/i);
  await expect(page.locator(".status-badge")).toHaveCount(0);
  await page.screenshot({ path: `${dir}/live-additional.png`, fullPage: true });
  for (const t of input.sourceAnalysis.graph.topics) { await page.getByLabel("Topic", { exact: true }).selectOption(t.id); await ready(page); }
  await page.getByRole("button", { name: "Expand graph" }).click(); await page.getByRole("button", { name: "Exit fullscreen" }).click();
  expect(JSON.parse(await readFile(`${dir}/ai-budget.json`, "utf8")).calls).toBe(baseline.calls + 1);
});
