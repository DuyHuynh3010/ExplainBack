/** Explicit opt-in, real Next API + browser. Requires persistent transport budget guard. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import type { SourceAnalysis, Statement } from "../src/backend/contracts/domain";
import { referencedConceptIds } from "../src/backend/contracts/graph";
import { validateImportedAnalysisResponse, validateEvaluateTextResponse } from "../src/backend/contracts/validate";
test.skip(process.env.RUN_GRAPH_V2_LIVE !== "1", "Explicit live opt-in required.");
test.use({ baseURL: "http://localhost:3000" });
const dir = "test-results/graph-v2";

test("live: full multisection source, topic views, then reordered contradictory explanation", async ({ page }) => {
  test.setTimeout(220000);
  const budget = JSON.parse(await readFile(`${dir}/live-budget.json`, "utf8"));
  const priorCalls = Number(process.env.GRAPH_V2_PRIOR_CALLS ?? "0");
  expect(budget.calls).toBe(priorCalls); expect(budget.calls).toBeLessThanOrEqual(2); expect(budget.stopped).toBe(false);
  const source = await readFile("tests/analysis/fixtures/multisection-source.txt", "utf8");
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Lesson title").fill("Multisection photosynthesis — v2 live verification");
  await page.getByLabel("Paste your learning material").fill(source);
  const analyzing = page.waitForResponse(r => r.url().endsWith("/api/analysis") && r.request().method() === "POST", { timeout: 135000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await analyzing, payload = await response.json(), request = response.request().postDataJSON();
  await writeFile(`${dir}/analysis-live-${priorCalls}.json`, JSON.stringify({ request, status: response.status(), response: payload, requestId: response.headers()["x-request-id"] }, null, 2));
  expect(payload.ok, `Live analysis stopped: ${payload.error?.code}`).toBe(true);
  expect(validateImportedAnalysisResponse(request, payload).valid).toBe(true);
  const analysis = payload.data as SourceAnalysis;
  expect(request.importedSource.originalSegments[0].text).toBe(source.replace(/\r\n/g, "\n"));
  expect(analysis.graph.topics.length).toBeGreaterThan(1);
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(analysis.graph.topics[0].id);
  const views = [];
  for (const [index, topic] of analysis.graph.topics.entries()) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    const statements = analysis.graph.statements.filter(s => s.topicId === topic.id);
    const used = new Set(statements.flatMap(s => referencedConceptIds(s.representation)));
    await expect(page.locator(".react-flow__node")).toHaveCount(used.size);
    await expect(page.locator(".react-flow__edge")).toHaveCount(statements.filter(s => s.representation.kind === "binary").length);
    await expect(page.getByRole("article", { name: "Complex statement", exact: true })).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(analysis.lessonSections.find(s => s.topicId === topic.id)!.summary);
    for (const s of statements) {
      await page.locator(`.relationship-list [data-statement-id="${s.id}"]`).click();
      const panel = page.getByRole("complementary", { name: "Source relationship details" });
      await expect(panel).toContainText(s.assertion);
      for (const id of s.evidenceIds) await expect(panel).toContainText(analysis.graph.evidence.find(e => e.id === id)!.quote);
    }
    await page.locator(".map-card").screenshot({ path: `${dir}/live-topic-${index}.png` });
    views.push({ topic: topic.title, nodes: used.size, binary: statements.filter(s => s.representation.kind === "binary").length, complex: statements.filter(s => s.representation.kind === "complex").length });
  }
  await writeFile(`${dir}/live-views.json`, JSON.stringify(views, null, 2));
  const afterAnalysis = JSON.parse(await readFile(`${dir}/live-budget.json`, "utf8"));
  expect(afterAnalysis.stopped).toBe(false); expect(afterAnalysis.calls - priorCalls).toBeLessThanOrEqual(2);
  expect(afterAnalysis.calls, "No generation budget remains for live evaluation").toBeLessThan(4);
  await page.getByRole("button", { name: "Write your explanation" }).click();
  const learner = "C4 photosynthesis first forms a four-carbon intermediate, whereas C3 forms a three-carbon compound. The Calvin cycle happens in the stroma and uses ATP and NADPH to assemble glucose from carbon dioxide. Chlorophyll absorbs red and blue light and reflects green light. Plants use sunlight for photosynthesis, using water and carbon dioxide to make glucose. Photosynthesis does not produce oxygen.";
  await page.getByLabel("Explanation text").fill(learner);
  const evaluating = page.waitForResponse(r => r.url().endsWith("/api/evaluations") && r.request().method() === "POST", { timeout: 75000 });
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  const evaluated = await evaluating, evaluation = await evaluated.json(), evaluationRequest = evaluated.request().postDataJSON();
  await writeFile(`${dir}/evaluation-live.json`, JSON.stringify({ request: evaluationRequest, status: evaluated.status(), response: evaluation }, null, 2));
  expect(evaluation.ok, `Live evaluation stopped: ${evaluation.error?.code}`).toBe(true);
  expect(validateEvaluateTextResponse(evaluationRequest, evaluation).valid).toBe(true);
  expect(evaluationRequest.sourceAnalysis).toEqual(analysis);
  const outcomes = [];
  for (const topic of analysis.graph.topics) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    for (const s of analysis.graph.statements.filter((s: Statement) => s.topicId === topic.id)) {
      const comparison = evaluation.data.comparisons.find((c: { referenceRelationshipId: string }) => c.referenceRelationshipId === s.id);
      const label = comparison.status[0].toUpperCase() + comparison.status.slice(1);
      await page.locator(`.relationship-list [data-statement-id="${s.id}"]`).click();
      await expect(page.getByRole("article", { name: "Explanation feedback" })).toContainText(comparison.explanation);
      outcomes.push({ id: s.id, assertion: s.assertion, representation: s.representation, status: comparison.status, explanation: comparison.explanation });
    }
  }
  await writeFile(`${dir}/live-outcomes.json`, JSON.stringify(outcomes, null, 2));
  expect(JSON.parse(await readFile(`${dir}/live-budget.json`, "utf8")).calls).toBeLessThanOrEqual(4);
});
