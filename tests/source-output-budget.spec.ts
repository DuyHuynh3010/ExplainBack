/** Explicit live resume of saved real checkpoint; no source regeneration or synthetic success. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const dir = "test-results/source-output-budget";
test("live source output budget: resume real part 1 -> full three-topic graph", async ({ page }, info) => {
  test.skip(process.env.RUN_SOURCE_OUTPUT_LIVE !== "1" || info.project.name !== "desktop", "Needs explicit new guarded source-generation budget.");
  test.setTimeout(150000);
  const saved = JSON.parse(await readFile("test-results/discrete-math-analysis/live-ui-responses.json", "utf8"));
  const previous = saved.responses.filter((r: { url: string }) => r.url === "/api/analysis");
  const input = JSON.parse(await readFile(`${dir}/request.json`, "utf8"));
  const ledger = JSON.parse(await readFile(`${dir}/ai-budget.json`, "utf8"));
  const replayResult = process.env.REPLAY_SOURCE_OUTPUT_RESULT === "1";
  expect(ledger.maxCalls).toBe(3); expect(ledger.stopped).toBe(false);
  let requests = 0, replayed = false;
  await page.route("**/api/sources", route => route.fulfill({ json: { ok: true, schemaVersion: "2.0", data: input.importedSource } }));
  await page.route("**/api/analysis", route => {
    requests++; const body = route.request().postDataJSON();
    expect(body.importedSource).toEqual(input.importedSource);
    if (!replayed) {
      replayed = true; expect(body.processing.completedParts).toHaveLength(0);
      // Replay the actual accepted checkpoint, not a fabricated draft.
      return route.fulfill({ json: previous[0].response });
    }
    expect(body.processing).toEqual(input.processing);
    if (replayResult) return readFile(`${dir}/live-response.json`, "utf8").then(text => route.fulfill({ json: JSON.parse(text).body }));
    return route.continue(); // Unmodified request to the actual source-analysis endpoint.
  });
  await page.route("**/api/evaluations", route => route.abort());
  await page.route("**/api/transcriptions", route => route.abort());
  await page.goto("/");
  await page.getByLabel("Paste your learning material").fill(input.importedSource.normalizedText);
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/analysis") && r.request().postDataJSON().processing.completedParts.length === 1, { timeout: 130000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await responsePromise, body = await response.json();
  await writeFile(`${dir}/live-response.json`, JSON.stringify({ status: response.status(), body }, null, 2));
  expect(response.status(), JSON.stringify(body.error)).toBe(200);
  expect(body.ok).toBe(true); expect(body.data.schemaVersion).toBe("2.0");
  expect(body.data.document).toEqual(input.importedSource.document);
  const { validateImportedAnalysisResponse } = await import("../src/backend/contracts/validate");
  // The imported-analysis validator accepts the base envelope, not orchestration metadata.
  const { processing: _requestProcessing, ...baseInput } = input;
  const { processing: _responseProcessing, ...baseResponse } = body;
  const validation = validateImportedAnalysisResponse(baseInput, baseResponse);
  expect(validation.issues).toEqual([]);
  expect(validation.valid).toBe(true);
  await expect(page.getByRole("heading", { name: "Reference graph", exact: true })).toBeVisible();
  const analysis = body.data;
  expect(analysis.graph.topics.map((t: { title: string }) => t.title)).toEqual(["Propositional logic", "Quantifiers", "Sets and functions"]);
  for (const topic of [...analysis.graph.topics, analysis.graph.topics[0]]) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true");
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-topic-id", topic.id);
    const statements = analysis.graph.statements.filter((s: { topicId: string }) => s.topicId === topic.id);
    await expect(page.locator(".relationship-list [data-statement-id]")).toHaveCount(statements.length);
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(analysis.lessonSections.find((s: { topicId: string }) => s.topicId === topic.id).summary);
    await page.locator(`[data-statement-id="${statements.at(-1).id}"]`).click();
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText(statements.at(-1).assertion);
  }
  expect(requests).toBe(2);
  const after = JSON.parse(await readFile(`${dir}/ai-budget.json`, "utf8"));
  if (replayResult) expect(after.calls).toBe(ledger.calls);
  else {
    expect(after.calls - ledger.calls).toBeGreaterThan(0);
    expect(after.calls - ledger.calls).toBeLessThanOrEqual(2);
  }
  expect(after.calls).toBeLessThanOrEqual(3);
  await writeFile(`${dir}/live-ui-check.json`, JSON.stringify({ provenance: replayResult ? "UI replay of the complete response obtained from the live endpoint in this session; no new generations" : "Saved real ingestion/part-1 replay; part-2 live endpoint, complete response and actual UI topic switching", requests, generations: after.calls - ledger.calls, totalSessionGenerations: after.calls, topics: analysis.graph.topics, statements: analysis.graph.statements.length }, null, 2));
  await page.screenshot({ path: `${dir}/live-graph.png`, fullPage: true });
});
