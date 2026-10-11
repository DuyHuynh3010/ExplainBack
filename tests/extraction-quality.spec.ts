/** Offline uses pipeline-produced synthetic output; live is explicitly opt-in. */
import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { SourceAnalysis, Statement } from "../src/backend/contracts/domain";
test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}` });

async function inspectTopics(page: Page, analysis: SourceAnalysis) {
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  for (const topic of analysis.graph.topics) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    const lesson = analysis.lessonSections.find(s => s.topicId === topic.id)!;
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(lesson.summary);
    const statements = analysis.graph.statements.filter(s => s.topicId === topic.id);
    await expect(page.locator(".react-flow__edge")).toHaveCount(statements.filter(s => s.representation.kind === "binary").length);
    await expect(page.getByRole("article", { name: "Complex statement", exact: true })).toHaveCount(statements.filter(s => s.representation.kind === "complex").length);
    for (const statement of statements) {
      await page.locator(`.relationship-list [data-statement-id="${statement.id}"]`).click();
      const panel = page.getByRole("complementary", { name: "Source relationship details" });
      await expect(panel).toContainText(statement.assertion);
      for (const condition of statement.conditions) await expect(panel).toContainText(condition);
      if (statement.representation.kind === "complex") for (const p of statement.representation.participants) {
        await expect(panel).toContainText(`${p.role}: ${analysis.graph.concepts.find(c => c.id === p.conceptId)!.name}`);
      }
      for (const id of statement.evidenceIds) await expect(panel).toContainText(analysis.graph.evidence.find(e => e.id === id)!.quote);
    }
  }
}

test("synthetic pipeline: scope labels, binary/complex details, definitions and summary", async ({ page }) => {
  test.skip(!existsSync("test-results/extraction-quality-v2/offline.json"), "Run extraction-quality.mjs first.");
  const fixture = JSON.parse(await readFile("test-results/extraction-quality-v2/offline.json", "utf8"));
  await page.route("**/api/sources", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: fixture.importedSource } }));
  await page.route("**/api/analysis", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: fixture.analysis } }));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(fixture.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const bacteria = fixture.analysis.graph.statements.find((s: Statement) => s.assertion.startsWith("Some types of bacteria"));
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  await page.getByLabel("Topic", { exact: true }).selectOption(bacteria.topicId);
  await expect(page.locator(".reference-edge-label").filter({ hasText: "Some types of bacteria" })).toHaveCount(1);
  await inspectTopics(page, fixture.analysis);
  await page.locator(".map-card").screenshot({ path: `test-results/extraction-quality-v2/synthetic-${test.info().project.name}.png` });
});

for (const name of ["biology", "non-biology"]) test(`synthetic representation: ${name} retains repeated-role participants and binary projections`, async ({ page }, info) => {
  const fixture = JSON.parse(await readFile(`test-results/representation-quality-v2/${name}.json`, "utf8"));
  await page.route("**/api/sources", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: fixture.importedSource } }));
  await page.route("**/api/analysis", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: fixture.analysis } }));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(fixture.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await inspectTopics(page, fixture.analysis);
  for (const topic of fixture.analysis.graph.topics) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    for (const s of fixture.analysis.graph.statements.filter((s: Statement) => s.topicId === topic.id && s.representation.kind === "complex")) {
      const card = page.getByRole("article", { name: "Complex statement", exact: true }).filter({ has: page.locator("p").filter({ hasText: s.assertion }) });
      await expect(card).toHaveCount(1);
      await expect(card.locator("li")).toHaveCount(s.representation.participants.length);
      for (const p of s.representation.participants) {
        const text = `${p.role}: ${fixture.analysis.graph.concepts.find((c: { id: string }) => c.id === p.conceptId).name}`;
        await expect(card.getByRole("listitem").filter({ hasText: text })).toHaveCount(1);
      }
    }
    for (const s of fixture.analysis.graph.statements.filter((s: Statement) => s.topicId === topic.id && s.representation.kind === "binary")) {
      // SVG edge identity and direction stay tied to the domain statement; no complex projection.
      await expect(page.locator(`.react-flow__edge[data-id="${s.id}"]`)).toHaveCount(1);
      const label = page.getByTitle(s.assertion, { exact: true });
      await expect(label).toHaveCount(1);
      for (const c of s.conditions) await expect(label).toContainText(c);
    }
  }
  await page.locator(".map-card").screenshot({ path: `test-results/representation-quality-v2/${name}-${info.project.name}.png` });
});

test("live representation: exact two-paragraph source, real routes and unmodified response", async ({ page }, info) => {
  test.skip(process.env.RUN_REPRESENTATION_QUALITY_LIVE !== "1" || info.project.name !== "desktop", "Explicit opt-in, two-generation server transport guard required.");
  test.setTimeout(150_000);
  const text = (await readFile("tests/analysis/fixtures/representation-quality-source.txt", "utf8")).trimEnd();
  let request: unknown;
  page.on("request", r => { if (r.url().endsWith("/api/analysis")) request = r.postDataJSON(); });
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(text);
  const pending = page.waitForResponse(r => r.url().endsWith("/api/analysis") && r.request().method() === "POST", { timeout: 130_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await pending, body = await response.json();
  await writeFile("test-results/representation-quality-v2/live.json", JSON.stringify({ provenance: "Actual local analysis; no mocks or corrected draft", request, status: response.status(), response: body }, null, 2));
  expect(response.status(), body.error?.code ?? "Real analysis").toBe(200);
  expect(body.ok).toBe(true);
  await inspectTopics(page, body.data);
  await page.locator(".map-card").screenshot({ path: "test-results/representation-quality-v2/live-ui.png" });
});

test("live extraction: unchanged two-paragraph source through real local routes", async ({ page }, info) => {
  test.skip(process.env.RUN_EXTRACTION_QUALITY_LIVE !== "1" || info.project.name !== "desktop", "Explicit opt-in; maximum two real generations enforced by server transport guard.");
  test.setTimeout(150_000);
  const text = (await readFile("tests/analysis/fixtures/extraction-quality-source.txt", "utf8")).trimEnd();
  let request: unknown;
  page.on("request", r => { if (r.url().endsWith("/api/analysis")) request = r.postDataJSON(); });
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Paste your learning material").fill(text);
  const pending = page.waitForResponse(r => r.url().endsWith("/api/analysis") && r.request().method() === "POST", { timeout: 130_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await pending, body = await response.json();
  await writeFile("test-results/extraction-quality-v2/live.json", JSON.stringify({ provenance: "Actual local source analysis; no mock or corrected draft", request, status: response.status(), response: body }, null, 2));
  expect(response.status(), body.error?.code ?? "Real source analysis").toBe(200);
  expect(body.ok).toBe(true);
  await inspectTopics(page, body.data);
  await page.locator(".map-card").screenshot({ path: "test-results/extraction-quality-v2/live-ui.png" });
});
