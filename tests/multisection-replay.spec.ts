import type { Statement } from "../src/backend/contracts/domain";
import { referencedConceptIds } from "../src/backend/contracts/graph";
import { normalizeEvaluation } from "../src/backend/explanations/evaluation";
/** Offline visual regression: a synthetic v2 graph, NOT live AI success. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
test.use({ baseURL: "http://localhost:3000" });
test.skip(!existsSync("test-results/graph-v2/offline.json"), "Run the offline multi-section regressions first.");
test("synthetic document-wide fixture: topic switching, summaries, endpoints and evidence", async ({ page }) => {
  const fixture = JSON.parse(await readFile("test-results/graph-v2/offline.json", "utf8"));
  const analysis = fixture.analysis;
  await page.route("**/api/sources", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: fixture.importedSource } }));
  await page.route("**/api/analysis", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: analysis } }));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Lesson title").fill("Offline synthetic v2 fixture");
  await page.getByLabel("Paste your learning material").fill(fixture.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(analysis.graph.topics[0].id);
  const topics = [];
  for (const [index, topic] of analysis.graph.topics.entries()) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    const section = analysis.lessonSections.find((s: { topicId: string }) => s.topicId === topic.id);
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(section.summary);
    const used = new Set(analysis.graph.statements.filter((s: Statement) => s.topicId === topic.id).flatMap((s: Statement) => referencedConceptIds(s.representation)));
    const concepts = analysis.graph.concepts.filter((c: { id: string }) => used.has(c.id));
    const statements = analysis.graph.statements.filter((s: { topicId: string }) => s.topicId === topic.id);
    await expect(page.locator(".react-flow__node")).toHaveCount(concepts.length);
    await expect(page.locator(".react-flow__edge")).toHaveCount(statements.filter((s: Statement) => s.representation.kind === "binary").length);
    await expect(page.getByRole("article", { name: "Complex statement", exact: true })).toHaveCount(statements.filter((s: Statement) => s.representation.kind === "complex").length);
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(statements[0].assertion);
    for (const statement of statements) {
      await page.locator(`.relationship-list [data-statement-id="${statement.id}"]`).click();
      const details = page.getByRole("complementary", { name: "Source relationship details" });
      await expect(details).toBeVisible();
      for (const id of statement.evidenceIds) {
        await expect(details.locator("blockquote").filter({ hasText: analysis.graph.evidence.find((e: { id: string }) => e.id === id).quote })).toBeVisible();
      }
    }
    await page.waitForTimeout(250);
    await page.locator(".map-card").screenshot({ path: `test-results/graph-v2/offline-topic-${index}.png` });
    topics.push({ title: topic.title, nodes: concepts.length, edges: statements.length });
  }
  await page.getByLabel("Topic", { exact: true }).selectOption(analysis.graph.topics[0].id);
  await expect(page.getByRole("article", { name: "Topic summary" })).toBeVisible();
  await writeFile("test-results/graph-v2/ui-offline.json", JSON.stringify({ provenance: fixture.provenance, topics }, null, 2));
  const joint = analysis.graph.statements.find((s: Statement) => s.representation.kind === "complex");
  const learner = "Plants use water to produce glucose.";
  await page.route("**/api/evaluations", route => {
    const request = route.request().postDataJSON();
    expect(request.sourceAnalysis).toEqual(analysis);
    const concepts = analysis.graph.concepts.filter((c: { name: string }) => ["Plants", "Water", "Glucose"].includes(c.name))
      .map((c: { id: string; name: string; aliases: string[] }) => ({ id: c.id, name: c.name, aliases: c.aliases }));
    const participants = concepts.map((c: { id: string; name: string }) => ({ conceptId: c.id, role: c.name === "Plants" ? "agent" : c.name === "Water" ? "input" : "output" }));
    const data = normalizeEvaluation(request, JSON.stringify({ concepts,
      claims: [{ id: "joint-learner", representation: { kind: "complex", participants }, assertion: learner, quote: learner, negated: false, conditions: [] }],
      comparisons: analysis.graph.statements.map((s: Statement) => ({ referenceRelationshipId: s.id, status: s.id === joint.id ? "partial" : "missing", learnerClaimIds: s.id === joint.id ? ["joint-learner"] : [], explanation: s.id === joint.id ? "Carbon dioxide is omitted from the joint inputs." : "Not expressed here.", suggestions: [] })), additionalIdeas: [],
    }));
    return route.fulfill({ json: { ok: true, schemaVersion: "2.0", data } });
  });
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill(learner);
  await page.getByRole("button", { name: "Create explanation graph", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explanation graph", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByLabel("Topic", { exact: true }).selectOption(joint.topicId);
  const row = page.locator(`[data-statement-id="${joint.id}"]`);
  await expect(row).toContainText("Partial");
  await row.click();
  await expect(page.getByRole("article", { name: "Explanation feedback" })).toContainText(learner);
  await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(joint.assertion);
  await page.locator(".map-card").screenshot({ path: "test-results/graph-v2/complex-feedback.png" });
});
