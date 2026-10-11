import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import type { SourceAnalysis } from "../src/backend/contracts/domain";

async function inspectTopics(page: Page, analysis: SourceAnalysis) {
  expect(analysis.graph.topics).toHaveLength(3);
  for (const topic of [...analysis.graph.topics, analysis.graph.topics[0]]) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    const statements = analysis.graph.statements.filter(s => s.topicId === topic.id);
    const concepts = new Set(statements.flatMap(s => s.representation.kind === "binary"
      ? [s.representation.subjectConceptId, s.representation.objectConceptId] : s.representation.participants.map(p => p.conceptId)));
    const complex = statements.filter(s => s.representation.kind === "complex");
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-topic-id", topic.id);
    await expect(page.locator(".react-flow__node")).toHaveCount(concepts.size + complex.length);
    await expect(page.locator(".react-flow__edge")).toHaveCount(statements.reduce((n, s) => n + (s.representation.kind === "binary" ? 1 : s.representation.participants.length), 0));
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(analysis.lessonSections.find(l => l.topicId === topic.id)!.summary);
    const panel = page.getByRole("complementary", { name: "Source relationship details" });
    await expect(panel).toContainText(statements[0].assertion);
    const last = statements.at(-1)!;
    await page.locator(`.relationship-list [data-statement-id="${last.id}"]`).click();
    await expect(panel).toContainText(last.assertion);
    const quote = analysis.graph.evidence.find(e => last.evidenceIds.includes(e.id))!;
    await expect(panel).toContainText(quote.quote);
  }
}

test("synthetic three-topic switching updates graph/summary/evidence without AI", async ({ page }) => {
  const f = JSON.parse(await readFile("test-results/topic-processing/compact.json", "utf8"));
  let requests = 0;
  await page.route("**/api/sources", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: f.importedSource } }));
  await page.route("**/api/analysis", route => {
    requests++;
    return route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: f.analysis, processing: { callsUsed: 1 } } });
  });
  await page.goto("/");
  await page.getByLabel("Paste your learning material").fill(f.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  const before = requests;
  await inspectTopics(page, f.analysis);
  expect(requests).toBe(before);
});

test("live discrete-math lesson: full input -> real analysis -> three topic views", async ({ page }, info) => {
  test.skip(process.env.RUN_DISCRETE_MATH_LIVE !== "1" || info.project.name !== "desktop", "Explicit opt-in; persistent transport cap of four generations including the diagnostic capture.");
  test.setTimeout(270_000);
  const dir = "test-results/discrete-math-analysis";
  const text = await readFile("tests/analysis/fixtures/discrete-math-source.txt", "utf8");
  const responses: unknown[] = [];
  let analysis: SourceAnalysis | undefined, failure: string | undefined, requests = 0;
  page.on("request", r => { if (r.url().endsWith("/api/analysis")) requests++; });
  page.on("response", async r => {
    if (!/\/api\/(?:sources|analysis)$/.test(r.url())) return;
    const response = await r.json();
    responses.push({ url: new URL(r.url()).pathname, status: r.status(), request: r.request().postDataJSON(), response });
    if (!response.ok) failure = `${response.error.code}: ${response.error.message}`;
    if (response.ok && response.data.graph) analysis = response.data;
    await writeFile(`${dir}/live-ui-responses.json`, JSON.stringify({ provenance: "Actual local API responses, no mocks or edited AI output", responses }, null, 2));
  });
  await page.goto("/");
  await page.getByLabel("Paste your learning material").fill(text);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => !!analysis || !!failure, { timeout: 250_000, intervals: [500] }).toBe(true);
  await page.screenshot({ path: `${dir}/live-ui-result.png`, fullPage: true });
  expect(failure).toBeUndefined();
  expect(analysis!.document.blocks.map(b => b.text).join("\n\n")).toContain("Equal cardinalities alone");
  expect(analysis!.graph.topics.map(t => t.title)).toEqual(["Propositional logic", "Quantifiers", "Sets and functions"]);
  const before = requests;
  await inspectTopics(page, analysis!);
  expect(requests).toBe(before);
  await page.locator(".map-card").screenshot({ path: `${dir}/live-ui-switching.png` });
  await writeFile(`${dir}/live-switching.json`, JSON.stringify({ topics: analysis!.graph.topics, statements: analysis!.graph.statements.length, requestsBefore: before, requestsAfter: requests, route: "1 -> 2 -> 3 -> 1" }, null, 2));
});
