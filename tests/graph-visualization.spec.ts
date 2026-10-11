/** Browser verification uses immutable synthetic analysis; all AI endpoints are mocked. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { SourceAnalysis, EvaluationResult } from "../src/backend/contracts/domain";

test.use({ baseURL: `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}` });
async function setup(page: Page) {
  const f = JSON.parse(await readFile("test-results/graph-visualization/fixture.json", "utf8"));
  let calls = 0;
  const ok = (data: unknown) => ({ ok: true, schemaVersion: "2.0", data });
  await page.route("**/api/sources", r => r.fulfill({ json: ok(f.importedSource) }));
  await page.route("**/api/analysis", r => { calls++; return r.fulfill({ json: ok(f.analysis) }); });
  await page.route("**/api/transcriptions", r => r.fulfill({ status: 503, json: { ok: false, schemaVersion: "2.0", error: { code: "AI_NOT_CONFIGURED", message: "Offline visualization test", retryable: false } } }));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true");
  return { ...f, calls: () => calls } as { analysis: SourceAnalysis; importedSource: unknown; calls: () => number };
}
async function boxes(page: Page) {
  const rects = await page.locator(".react-flow__node").evaluateAll(nodes => nodes.map(n => { const b = n.getBoundingClientRect(); return { id: n.getAttribute("data-id"), x: b.x, y: b.y, w: b.width, h: b.height }; }));
  for (const [i, a] of rects.entries()) for (const b of rects.slice(i + 1)) {
    expect(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `Node boxes overlap: ${a.id} / ${b.id}`).toBe(true);
  }
}
const viewport = (page: Page) => page.locator(".react-flow__viewport").getAttribute("style");

test("linked topics: actual node measurements, role selection, highlight, stable viewport and expanded explorer", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const f = await setup(page);
  await expect(page.locator(".review-notes")).not.toHaveAttribute("open", "");
  await page.locator(".review-notes summary").click();
  await expect(page.locator(".review-notes")).toContainText("Synthetic note");
  await expect(page.locator(".analysis-warnings")).not.toContainText("EXTRACTION_REVIEW");
  await page.locator(".review-notes summary").click();
  await expect(page.locator(".knowledge-node.relation")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(6);
  await expect(page.getByText("2 RELATIONSHIPS", { exact: true })).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `test-results/graph-visualization/initial-readable-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Expand graph", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Expanded graph explorer" })).toBeVisible();
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page.waitForTimeout(350);
  await boxes(page);
  const statement = f.analysis.graph.statements[1];
  const relation = page.locator(`.react-flow__node[data-id="relation:${f.analysis.graph.id}:${statement.id}"]`);
  const before = await viewport(page);
  await relation.click();
  await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(statement.assertion);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(3);
  expect(await viewport(page)).toBe(before);
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  const concept = page.locator(`.react-flow__node[data-id="${f.analysis.graph.id}:${statement.representation.kind === "complex" ? statement.representation.participants[0].conceptId : ""}"]`);
  await concept.click();
  await expect(page.locator(".graph-dim")).not.toHaveCount(0);
  expect(await viewport(page)).toBe(before);
  // A background click clears only highlight, preserving the current evidence panel.
  await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
  await expect(page.locator(".graph-dim")).toHaveCount(0);
  await page.getByLabel("Topic", { exact: true }).selectOption(f.analysis.graph.topics[1].id);
  for (const topic of f.analysis.graph.topics) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-topic-id", topic.id);
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true");
    if (await page.getByRole("button", { name: "Hide details", exact: true }).count()) await page.getByRole("button", { name: "Hide details", exact: true }).click();
    await page.getByRole("button", { name: "Fit graph", exact: true }).click(); await page.waitForTimeout(350);
    await boxes(page);
    const statements = f.analysis.graph.statements.filter(s => s.topicId === topic.id);
    // Topic/view selections are cached now; returning to a topic retains its claim.
    const selectedId = await page.locator('.relationship-list [aria-pressed="true"]').getAttribute("data-statement-id");
    // The drawer is intentionally collapsed while clicking the canvas; its cached
    // content still follows the selected topic and the edge click below opens it.
    await expect(page.locator("#graph-details")).toContainText(statements.find(s => s.id === selectedId)!.assertion);
    await expect(page.locator(".react-flow__edge")).toHaveCount(statements.reduce((n, s) => n + (s.representation.kind === "binary" ? 1 : s.representation.participants.length), 0));
    await page.screenshot({ path: `test-results/graph-visualization/${topic.title.replaceAll(" ", "-")}-${info.project.name}.png`, fullPage: true });
    const firstEdge = page.locator(".react-flow__edge-interaction").first();
    const edgeId = await firstEdge.evaluate(el => el.closest(".react-flow__edge")!.getAttribute("data-id")!);
    const clicked = statements.find(s => edgeId === s.id || edgeId.startsWith(`role:${s.id}:`))!;
    const p = await firstEdge.evaluate(el => { const path = el as SVGPathElement; const p = path.getPointAtLength(path.getTotalLength() / 2); const s = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!); return { x: s.x, y: s.y }; });
    await page.mouse.click(p.x, p.y);
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(clicked.assertion);
  }
  expect(f.calls()).toBe(1);
  await page.getByLabel("Topic", { exact: true }).selectOption(f.analysis.graph.topics[0].id);
  await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true");
  // Rapid topic changes must not accept an older asynchronous layout.
  await page.getByLabel("Topic", { exact: true }).selectOption(f.analysis.graph.topics[2].id);
  await page.getByLabel("Topic", { exact: true }).selectOption(f.analysis.graph.topics[0].id);
  await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".knowledge-node.relation")).toHaveCount(2);
  // Native browser chrome owns Escape; emulate external exit for headless automation.
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand graph" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("evaluation statuses label binary and complex roles without changing counts or source IDs", async ({ page }) => {
  const f = await setup(page), statuses = ["correct", "partial", "missing", "contradicted", "uncertain"] as const;
  await page.route("**/api/evaluations", async route => {
    const input = route.request().postDataJSON();
    // Synthetic statuses exercise rendering only; real validation binds source IDs
    // and quotes. This fixture does not establish semantic classification quality.
    const { normalizeEvaluation } = await import("../src/backend/explanations/evaluation");
    const concepts = [{ id: "learner", name: "Explanation", aliases: [] }];
    const claims = [{ id: "claim", representation: { kind: "complex", participants: [{ conceptId: "learner", role: "context" }] }, assertion: input.learner.text, negated: false, conditions: [], quote: input.learner.text }];
    const raw = { concepts, claims, comparisons: f.analysis.graph.statements.map((s, i) => ({ referenceRelationshipId: s.id, status: statuses[i % 5], learnerClaimIds: statuses[i % 5] === "missing" ? [] : ["claim"], explanation: "Synthetic status display test, not semantic evaluation.", suggestions: [] })), additionalIdeas: [] };
    const evaluation = normalizeEvaluation(input, JSON.stringify(raw)) as EvaluationResult;
    await route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: evaluation } });
  });
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill("Synthetic learner statement for display testing.");
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  for (const topic of f.analysis.graph.topics) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true");
    const statements = f.analysis.graph.statements.filter(s => s.topicId === topic.id);
    await expect(page.locator(".map-card .small-label")).toContainText(`${statements.length} LESSON CLAIMS`);
    for (const s of statements) {
      const status = statuses[f.analysis.graph.statements.indexOf(s) % 5];
      const comparison = await page.locator(`.relationship-list [data-detail-id]`).filter({ hasText: s.assertion }).first();
      await expect(comparison.locator(".status-badge")).toHaveText(new RegExp(status, "i"));
      if (s.representation.kind === "complex") await expect(page.locator(`.react-flow__node[data-id="relation:${f.analysis.graph.id}:${s.id}"] .status-badge`)).toHaveCount(0);
      await comparison.click();
      await expect(page.getByRole("complementary", { name: "Comparison details" }).locator(".card-heading .status-badge")).toHaveText(new RegExp(status, "i"));
    }
  }
});
