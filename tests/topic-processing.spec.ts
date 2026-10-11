import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import type { SourceAnalysis } from "../src/backend/contracts/domain";
test.use({ baseURL: `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3000"}` });

async function switchTopics(page: Page, analysis: SourceAnalysis) {
  const topics = analysis.graph.topics;
  expect(topics.length).toBeGreaterThanOrEqual(3);
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(topics[0].id);
  for (const topic of [topics[0], topics[1], topics[2], topics[0]]) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    const selected = analysis.graph.statements.filter(s => s.topicId === topic.id);
    const ids = new Set(selected.flatMap(s => s.representation.kind === "binary" ? [s.representation.subjectConceptId, s.representation.objectConceptId] : s.representation.participants.map(p => p.conceptId)));
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-topic-id", topic.id);
    await expect(page.locator(".react-flow__node")).toHaveCount(ids.size);
    expect((await page.locator(".react-flow__node").evaluateAll(nodes => nodes.map(n => n.getAttribute("data-id")))).sort()).toEqual([...ids].map(id => `${analysis.graph.id}:${id}`).sort());
    await expect(page.locator(".react-flow__edge")).toHaveCount(selected.filter(s => s.representation.kind === "binary").length);
    await expect(page.locator(".relationship-list [data-statement-id]")).toHaveCount(selected.length);
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(analysis.lessonSections.find(l => l.topicId === topic.id)!.summary);
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(selected[0].assertion);
    for (const s of selected) await expect(page.locator(`.relationship-list [data-statement-id="${s.id}"]`)).toBeVisible();
    await page.locator(`.relationship-list [data-statement-id="${selected.at(-1)!.id}"]`).click();
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(selected.at(-1)!.assertion);
  }
}

for (const retry of [false, true]) test(`synthetic multi-topic UI: switching without requests${retry ? "; retry preserves completed parts" : ""}`, async ({ page }, info) => {
  const f = JSON.parse(await readFile("test-results/topic-processing/offline.json", "utf8"));
  let imports = 0, requests = 0, failed = false;
  await page.route("**/api/sources", route => { imports++; return route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: f.importedSource } }); });
  await page.route("**/api/analysis", async route => {
    requests++;
    const r = route.request().postDataJSON(), index = r.processing.completedParts.length;
    if (retry && index === 1 && !failed) {
      failed = true;
      await route.fulfill({ status: 503, json: { ok: false, schemaVersion: "2.0", error: { code: "UPSTREAM_UNAVAILABLE", message: "Mock provider failure.", retryable: true }, processing: { callsUsed: 2 } } }); return;
    }
    const callsUsed = index + 1 + (failed ? 1 : 0);
    const data = index < f.checkpoints.length ? { kind: "part_complete", part: f.checkpoints[index][index], completed: index + 1, total: f.seen.length, nextTitle: f.seen[index + 1].section.title } : f.analysis;
    await route.fulfill({ json: { ok: true, schemaVersion: "2.0", data, processing: { callsUsed } } });
  });
  await page.goto("/"); await page.waitForLoadState("networkidle"); await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (retry) {
    await expect(page.getByRole("region", { name: "Learning source" }).getByRole("alert")).toContainText("Mock provider failure");
    await expect(page.getByLabel("Paste your learning material")).toHaveValue(f.importedSource.normalizedText);
    await expect(page.getByText("Completed parts are kept", { exact: false })).toBeVisible();
    expect(requests).toBe(2);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  expect(requests).toBe(f.seen.length + (retry ? 1 : 0)); expect(imports).toBe(1);
  const count = requests;
  await switchTopics(page, f.analysis); expect(requests).toBe(count);
  await page.getByRole("button", { name: "Back to source", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible(); expect(requests).toBe(count);
  await page.locator(".map-card").screenshot({ path: `test-results/topic-processing/synthetic-${retry ? "retry" : "normal"}-${info.project.name}.png` });
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(page.getByLabel("Paste your learning material")).toHaveValue("");
});

test("live multi-topic: full source -> every part -> topic 1/2/3/1 without new AI", async ({ page }, info) => {
  test.skip(process.env.RUN_TOPIC_PROCESSING_LIVE !== "1" || info.project.name !== "desktop", "Explicit opt-in, guarded eight-generation session.");
  test.setTimeout(500_000);
  const text = (await readFile("tests/analysis/fixtures/multisection-source.txt", "utf8")).trimEnd();
  const responses: unknown[] = [];
  let requests = 0, analysis: SourceAnalysis | undefined, failed: string | undefined;
  page.on("request", r => { if (r.url().endsWith("/api/analysis")) requests++; });
  page.on("response", async r => {
    if (!r.url().endsWith("/api/analysis")) return;
    const body = await r.json(); responses.push({ status: r.status(), request: r.request().postDataJSON(), response: body });
    if (body.ok && body.data.graph) analysis = body.data;
    if (!body.ok) failed = `${body.error.code}: ${body.error.message}`;
    await writeFile("test-results/topic-processing/live.json", JSON.stringify({ provenance: "Real local multi-part requests; no mocks or corrected output", responses }, null, 2));
  });
  await page.goto("/"); await page.waitForLoadState("networkidle"); await page.getByLabel("Paste your learning material").fill(text);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => !!analysis || !!failed, { timeout: 470_000, intervals: [500] }).toBe(true);
  expect(failed, "Real analysis must complete without mock fallback").toBeUndefined();
  const count = requests;
  await switchTopics(page, analysis!); expect(requests).toBe(count);
  await page.locator(".map-card").screenshot({ path: "test-results/topic-processing/live-ui.png" });
  await writeFile("test-results/topic-processing/live-switching.json", JSON.stringify({ topicIds: analysis!.graph.topics.map(t => t.id), topicCounts: analysis!.graph.topics.map(t => ({ title: t.title, statements: analysis!.graph.statements.filter(s => s.topicId === t.id).length })), requestsBeforeSwitching: count, requestsAfterSwitching: requests, route: "1 -> 2 -> 3 -> 1" }, null, 2));
});

test("synthetic: one part with three headings still opts into semantic topic processing", async ({ page }) => {
  const f = JSON.parse(await readFile("test-results/topic-processing/compact.json", "utf8"));
  let requests = 0;
  await page.route("**/api/sources", r => r.fulfill({ json: { ok: true, schemaVersion: "2.0", data: f.importedSource } }));
  await page.route("**/api/analysis", r => {
    requests++; expect(r.request().postDataJSON().processing).toEqual({ completedParts: [], callsUsed: 0 });
    return r.fulfill({ json: { ok: true, schemaVersion: "2.0", data: f.analysis, processing: { callsUsed: 1 } } });
  });
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  await switchTopics(page, f.analysis); expect(requests).toBe(1);
});
