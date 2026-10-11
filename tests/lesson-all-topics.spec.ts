/** Offline browser replay only. All API requests are intercepted; no AI calls. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { ImportedSource, SourceAnalysis } from "../src/backend/contracts/domain";

// The existing local dev server permits its HMR connection on localhost.
test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}`, channel: "chromium" });

test("Lesson topic 1 -> All topics -> topic 2: shared IDs, evidence, fullscreen and cached scope", async ({ page }, info) => {
  const f = JSON.parse(await readFile(".explainback-artifacts/lesson-all-topics/fixture.json", "utf8")) as { analysis: SourceAnalysis; importedSource: ImportedSource };
  const requests: string[] = [], errors: string[] = [];
  page.on("request", r => { if (!r.url().includes("/_next/")) requests.push(`${r.method()} ${r.url()}`); });
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/**", r => {
    const path = new URL(r.request().url()).pathname;
    const data = path === "/api/sources" ? f.importedSource : path === "/api/analysis" ? f.analysis : null;
    return data ? r.fulfill({ json: { ok: true, schemaVersion: "2.0", data } })
      : r.fulfill({ status: 500, json: { ok: false, schemaVersion: "2.0", error: { code: "INVALID_REQUEST", message: "Unexpected API in offline test", retryable: false } } });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const scope = page.getByLabel("Topic", { exact: true }), canvas = page.getByLabel("Source concept map");
  const [first, second] = f.analysis.graph.topics;
  const complex = f.analysis.graph.statements[0], storage = f.analysis.graph.statements[1];
  const panel = page.getByRole("complementary", { name: "Source relationship details" });
  await expect(scope).toHaveValue(first.id);
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".relationship-list [data-statement-id]")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Topic summary", exact: true })).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  const beforeRequests = [...requests];

  await scope.selectOption("__all__");
  await expect(canvas).toHaveAttribute("data-topic-id", "__all__");
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".relationship-list [data-statement-id]")).toHaveCount(5);
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(page.locator(".react-flow__edge")).toHaveCount(7);
  for (const t of f.analysis.graph.topics) await expect(page.getByRole("article", { name: `Topic summary: ${t.title}`, exact: true })).toBeVisible();
  const nodeIds = await page.locator(".react-flow__node").evaluateAll(nodes => nodes.map(n => n.getAttribute("data-id")));
  expect(new Set(nodeIds).size).toBe(nodeIds.length);
  const glucose = f.analysis.graph.concepts.find(c => c.name === "Glucose")!;
  await expect(page.locator(`.react-flow__node[data-id="${f.analysis.graph.id}:${glucose.id}"]`)).toHaveCount(1);

  // Summary links keep the original statement and evidence association.
  await page.getByRole("article", { name: `Topic summary: ${second.title}`, exact: true }).getByRole("button", { name: "View supporting statement 1", exact: true }).click();
  await expect(panel).toContainText(storage.assertion);
  await expect(panel.locator("blockquote")).toHaveText(`“${storage.assertion}”`);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(1);

  await page.getByRole("button", { name: "Expand graph", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Expanded graph explorer" })).toBeVisible();
  await expect(page.locator(".graph-workspace .lesson-summary")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await fit(page);
  const relation = page.locator(`.react-flow__node[data-id="relation:${f.analysis.graph.id}:${complex.id}"]`);
  await relation.click();
  await expect(panel).toContainText(complex.assertion);
  await expect(panel.locator("blockquote")).toHaveText(`“${complex.assertion}”`);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(3);
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await fit(page);

  // A node resolves to one of its incident source claims, not an unrelated panel.
  const energy = f.analysis.graph.concepts.find(c => c.name === "Chemical energy")!;
  await page.locator(`.react-flow__node[data-id="${f.analysis.graph.id}:${energy.id}"]`).click();
  await expect(panel).toContainText(storage.assertion);
  await expect(page.locator(".graph-dim")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await fit(page);
  const edge = page.locator(`.react-flow__edge[data-id="${storage.id}"] .react-flow__edge-interaction`);
  const point = await edge.evaluate(el => {
    const path = el as SVGPathElement, p = path.getPointAtLength(path.getTotalLength() / 2);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(panel.locator("blockquote")).toHaveText(`“${storage.assertion}”`);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await fit(page);
  const viewport = page.locator(".react-flow__viewport"), oldTransform = await viewport.getAttribute("style");
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.wheel(0, -200);
  await expect(viewport).not.toHaveAttribute("style", oldTransform!);

  // Leaving All drops its selection; the new scope starts with its own evidence.
  await scope.selectOption(second.id);
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".relationship-list [data-statement-id]")).toHaveCount(1);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(0);
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(panel).toContainText(storage.assertion);
  await expect(panel).not.toContainText(complex.assertion);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Topic summary", exact: true })).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  expect(requests).toEqual(beforeRequests);
  expect(requests.filter(r => r.includes("/api/"))).toHaveLength(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `.explainback-artifacts/lesson-all-topics/topic-two-${info.project.name}.png`, fullPage: true });
});

async function fit(page: Page) {
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page.waitForTimeout(350);
}
