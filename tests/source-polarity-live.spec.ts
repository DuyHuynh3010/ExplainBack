/** Genuine endpoint test of the unfinished section only; never fabricates old checkpoints. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { validateImportedAnalysisResponse } from "../src/backend/contracts/validate";

test("live unfinished Graphs and trees section: source -> validated analysis -> graph", async ({ page }, info) => {
  test.skip(process.env.RUN_SOURCE_POLARITY_LIVE !== "1" || info.project.name !== "desktop", "Explicit bounded live opt-in only.");
  test.setTimeout(150000);
  const dir = "test-results/source-polarity";
  const text = await readFile(`${dir}/unfinished-part.txt`, "utf8");
  const before = JSON.parse(await readFile(`${dir}/ai-budget.json`, "utf8"));
  expect(before.maxCalls).toBe(2); expect(before.stopped).toBe(false);
  const importResponse = page.waitForResponse(r => r.url().endsWith("/api/sources"));
  const analysisResponse = page.waitForResponse(r => r.url().endsWith("/api/analysis"), { timeout: 130000 });
  let analysisRequests = 0;
  page.on("request", r => { if (r.url().endsWith("/api/analysis")) analysisRequests++; });
  await page.route("**/api/evaluations", r => r.abort());
  await page.route("**/api/transcriptions", r => r.abort());
  await page.goto("/");
  await page.getByLabel("Paste your learning material").fill(text);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const imported = await (await importResponse).json();
  const response = await analysisResponse, body = await response.json();
  const request = response.request().postDataJSON();
  await writeFile(`${dir}/live-api.json`, JSON.stringify({ provenance: "New live isolated unfinished section; NOT the old request or full source resume", requestId: response.headers()["x-request-id"], status: response.status(), request, body }, null, 2));
  expect(response.status(), JSON.stringify(body.error)).toBe(200);
  expect(body.ok).toBe(true);
  const validation = validateImportedAnalysisResponse(request, body);
  expect(validation.issues).toEqual([]);
  expect(validation.valid).toBe(true);
  expect(body.data.document).toEqual(imported.data.document);
  expect(body.data.document.blocks.map((b: { text: string }) => b.text).join("\n\n")).toBe(text);
  const absence = body.data.graph.statements.filter((s: { assertion: string }) => /\b(?:no cycles|does not (?:have|contain) cycles|without cycles)\b/i.test(s.assertion));
  expect(absence.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Reference graph", exact: true })).toBeVisible();
  await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-layout-ready", "true");
  const originalRequests = analysisRequests;
  for (const topic of [...body.data.graph.topics, body.data.graph.topics[0]]) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    await expect(page.getByLabel("Source concept map")).toHaveAttribute("data-topic-id", topic.id);
    await expect(page.getByRole("article", { name: "Topic summary" })).toContainText(body.data.lessonSections.find((l: { topicId: string }) => l.topicId === topic.id).summary);
  }
  const statement = absence[0];
  await page.getByLabel("Topic", { exact: true }).selectOption(statement.topicId);
  await page.locator(`.relationship-list [data-statement-id="${statement.id}"]`).click();
  const detail = page.getByRole("complementary", { name: "Source relationship details" });
  await expect(detail).toContainText(statement.assertion);
  await expect(detail).toContainText(body.data.graph.evidence.find((e: { id: string }) => statement.evidenceIds.includes(e.id)).quote);
  expect(analysisRequests).toBe(originalRequests);
  const after = JSON.parse(await readFile(`${dir}/ai-budget.json`, "utf8"));
  expect(after.calls - before.calls).toBeGreaterThan(0); expect(after.calls).toBeLessThanOrEqual(2);
  await writeFile(`${dir}/live-ui.json`, JSON.stringify({ provenance: "Live unfinished section only; old checkpoint unavailable", generations: after.calls, analysisRequests, topics: body.data.graph.topics, absenceStatements: absence, topicReselectionCausedAI: false }, null, 2));
  await page.screenshot({ path: `${dir}/live-graph.png`, fullPage: true });
});
