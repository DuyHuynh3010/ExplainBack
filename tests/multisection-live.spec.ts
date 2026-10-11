import type { Statement } from "../src/backend/contracts/domain";
import { referencedConceptIds } from "../src/backend/contracts/graph";
/** Explicit live opt-in; caller must enforce the remaining session budget. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { validateImportedAnalysisResponse } from "../src/backend/contracts/validate";
test.skip(process.env.RUN_MULTISECTION_LIVE !== "1", "Paid live verification requires explicit opt-in; never part of offline checks.");
test.use({ baseURL: "http://localhost:3000" });
test("real multi-section source: endpoint, topic switching, graph endpoints and evidence", async ({ page }) => {
  test.setTimeout(180000);
  const dir = "test-results/multisection";
  await mkdir(dir, { recursive: true });
  const input = await readFile("tests/analysis/fixtures/multisection-source.txt", "utf8");
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Lesson title").fill("Multi-section photosynthesis");
  await page.getByLabel("Paste your learning material").fill(input);
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/analysis") && r.request().method() === "POST", { timeout: 135000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await responsePromise, payload = await response.json(), request = response.request().postDataJSON();
  const requestId = response.headers()["x-request-id"];
  const lines = (await readFile(".next/dev/logs/source-analysis.jsonl", "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(e => e.requestId === requestId);
  const sdkAttempts = lines.filter(e => e.stage === "sdk_request").length;
  // An optional transport guard can block an SDK attempt before sending it.
  const generations = process.env.MULTISECTION_GENERATION_GUARD_MARKER
    ? Number(typeof await readFile(process.env.MULTISECTION_GENERATION_GUARD_MARKER, "utf8").catch(() => undefined) === "string")
    : sdkAttempts;
  const totalTaskCalls = Number(process.env.MULTISECTION_PRIOR_CALLS ?? "0") + generations;
  const record = { provenance: "Actual local Next endpoint and browser UI; no intercepted responses", requestId, httpStatus: response.status(), sdkAttempts, generations, totalTaskCalls, events: lines };
  await writeFile(`${dir}/ui-live.json`, JSON.stringify({ request, response: payload, record }, null, 2));
  console.log(JSON.stringify(record));
  expect(totalTaskCalls).toBeLessThanOrEqual(4); expect(generations).toBeLessThanOrEqual(2);
  expect(payload.ok, `Stop on live error: ${payload.error?.code ?? response.status()}`).toBe(true);
  expect(validateImportedAnalysisResponse(request, payload).valid).toBe(true);
  expect(request.importedSource.originalSegments[0].text).toBe(input.replace(/\r\n/g, "\n"));
  expect(payload.data.document.blocks.some((b: { text: string }) => b.text.includes("The National Geographic Society"))).toBe(true);
  const analysis = payload.data;
  expect(analysis.graph.topics.length).toBeGreaterThan(1);
  const visuals = [];
  for (const [index, topic] of analysis.graph.topics.entries()) {
    await page.getByLabel("Topic", { exact: true }).selectOption(topic.id);
    await expect(page.getByRole("article", { name: "Topic summary" })).toBeVisible();
    const used = new Set(analysis.graph.statements.filter((s: Statement) => s.topicId === topic.id).flatMap((s: Statement) => referencedConceptIds(s.representation)));
    const concepts = analysis.graph.concepts.filter((c: { id: string }) => used.has(c.id));
    const statements = analysis.graph.statements.filter((s: { topicId: string }) => s.topicId === topic.id);
    await expect(page.locator(".react-flow__node")).toHaveCount(concepts.length);
    await expect(page.locator(".react-flow__edge")).toHaveCount(statements.filter((s: Statement) => s.representation.kind === "binary").length);
    for (const statement of statements) {
      for (const id of referencedConceptIds(statement.representation)) expect(concepts.some((c: { id: string }) => c.id === id)).toBe(true);
      await page.locator(`.relationship-list [data-statement-id="${statement.id}"]`).click();
      const evidence = page.getByRole("complementary", { name: "Source relationship details" });
      await expect(evidence).toBeVisible();
      for (const id of statement.evidenceIds) {
        const quote = analysis.graph.evidence.find((e: { id: string }) => e.id === id).quote;
        await expect(evidence.locator("blockquote").filter({ hasText: quote })).toBeVisible();
      }
    }
    await page.waitForTimeout(200);
    await page.locator(".reference-graph").screenshot({ path: `${dir}/topic-${index}.png` });
    visuals.push({ topicId: topic.id, title: topic.title, nodes: concepts.length, edges: statements.length });
  }
  await page.getByLabel("Topic", { exact: true }).selectOption(analysis.graph.topics[0].id);
  await expect(page.getByRole("article", { name: "Topic summary" })).toBeVisible();
  await writeFile(`${dir}/ui-topics.json`, JSON.stringify(visuals, null, 2));
});
