/** Visual audit replays saved REAL outputs; no new AI or semantic mock success. */
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
test.use({ baseURL: "http://localhost:3000" });
const artifact = "test-results/v3-audit/analysis-live.json";
test.skip(!existsSync(artifact) || JSON.parse(readFileSync(artifact, "utf8")).response?.schemaVersion !== "2.0", "Historical v1 visual capture is incompatible with v2; use multisection-replay.spec.ts. Never reinterpret old responses as current.");
test("V3 saved real graph: visual metrics, short gate and captured evaluation outcomes", async ({ page }, testInfo) => {
  const captured = JSON.parse(await readFile("test-results/v3-audit/analysis-live.json", "utf8"));
  const results: Record<string, unknown> = { provenance: "Browser replay of saved real responses; no live HTTP inference", project: testInfo.project.name };
  const analysis = captured.response.data;
  let evaluationName = "short";
  await page.route("**/api/sources", route => route.fulfill({ json: { ok: true, schemaVersion: "1.0", data: captured.request.importedSource } }));
  await page.route("**/api/analysis", route => route.fulfill({ json: captured.response }));
  await page.route("**/api/evaluations", async route => {
    const stored = JSON.parse(await readFile(`test-results/v3-audit/${evaluationName}-live.json`, "utf8"));
    expect(route.request().postDataJSON().sourceAnalysis.id).toBe(analysis.id);
    await route.fulfill({ status: stored.record.httpStatus, json: stored.response });
  });
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await page.getByLabel("Lesson title").fill("V3 saved real output visual audit");
  await page.getByLabel("Paste your learning material").fill(captured.request.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(analysis.graph.concepts.length);
  await page.waitForTimeout(750);
  results.graph = await page.evaluate((statements: { id: string; subjectConceptId: string; objectConceptId: string }[]) => {
    const element = document.querySelector(".react-flow__viewport")!;
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    const collect = (selector: string) => Array.from(document.querySelectorAll(selector)).map(e => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent, id: e.getAttribute("data-id"), fontCssPx: parseFloat(getComputedStyle(e).fontSize), effectiveFontPx: parseFloat(getComputedStyle(e).fontSize) * matrix.a, x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const labels = collect(".reference-edge-label"), nodes = collect(".react-flow__node");
    const overlaps: unknown[] = [];
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) overlaps.push({ first: a.text, second: b.text });
    }
    const crossings: unknown[] = [];
    for (const group of Array.from(document.querySelectorAll('.react-flow__edge'))) {
      const id = group.getAttribute('data-id'), statement = statements.find(s => s.id === id);
      const path = group.querySelector<SVGPathElement>('.react-flow__edge-path');
      if (!statement || !path) continue;
      const transform = path.getScreenCTM();
      if (!transform) continue;
      const touched = new Set<string>();
      for (let at = 1; at < 100; at++) {
        const p = path.getPointAtLength(path.getTotalLength() * at / 100);
        const screen = new DOMPoint(p.x, p.y).matrixTransform(transform);
        for (const node of nodes) {
          if (node.id?.endsWith(`:${statement.subjectConceptId}`) || node.id?.endsWith(`:${statement.objectConceptId}`)) continue;
          if (screen.x > node.x && screen.x < node.x + node.width && screen.y > node.y && screen.y < node.y + node.height) touched.add(node.text ?? '');
        }
      }
      if (touched.size) crossings.push({ statementId: id, throughUnrelatedNodes: [...touched] });
    }
    return { zoom: matrix.a, nodes, labels, labelOverlaps: overlaps, edgeNodeCrossings: crossings, renderedEdges: document.querySelectorAll(".react-flow__edge").length };
  }, analysis.graph.statements);
  await page.screenshot({ path: `test-results/v3-audit/graph-${testInfo.project.name}.png`, fullPage: true });
  for (const statement of analysis.graph.statements) {
    await page.getByRole("button", { name: statement.assertion + " Source", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Write your explanation" }).click();
  const text = page.getByLabel("Explanation text");
  const evaluate = page.getByRole("button", { name: "Evaluate", exact: true });
  await expect(evaluate).toBeDisabled();
  await text.fill("x"); await expect(evaluate).toBeEnabled();
  results.oneCharacterEnabled = true;
  await page.locator("#explanation-file").setInputFiles("tests/sources/fixtures/text.pdf");
  await expect(evaluate).toBeDisabled();
  await page.getByRole("button", { name: "Remove text.pdf" }).click();
  await expect(evaluate).toBeEnabled();
  results.pendingExplanationFileBlocksEvaluation = true;
  const short = JSON.parse(await readFile("test-results/v3-audit/short-live.json", "utf8"));
  await text.fill(short.request.learner.text); await expect(evaluate).toBeEnabled();
  await evaluate.click(); await expect(page.getByRole("heading", { name: "Your explanation feedback", level: 1 })).toBeVisible();
  results.shortFeedbackRendered = true;
  await page.getByRole("button", { name: "Edit and try again" }).click();
  evaluationName = "paraphrase";
  const paraphrase = JSON.parse(await readFile("test-results/v3-audit/paraphrase-live.json", "utf8"));
  await text.fill(paraphrase.request.learner.text); await evaluate.click();
  await expect(page.locator('.request-message[role="alert"]')).toContainText("structured schema");
  await expect(text).toHaveValue(paraphrase.request.learner.text);
  results.paraphraseErrorKeptInput = true;
  evaluationName = "contradiction";
  const contradiction = JSON.parse(await readFile("test-results/v3-audit/contradiction-live.json", "utf8"));
  await text.fill(contradiction.request.learner.text); await evaluate.click();
  await expect(page.getByRole("heading", { name: "Your explanation feedback", level: 1 })).toBeVisible();
  await expect(page.locator(".relationship-list").getByText("Contradicted", { exact: true })).toHaveCount(2);
  await page.screenshot({ path: `test-results/v3-audit/contradiction-${testInfo.project.name}.png`, fullPage: true });
  results.contradictedBadges = 2;
  await writeFile(`test-results/v3-audit/visual-${testInfo.project.name}.json`, JSON.stringify(results, null, 2));
});

test("V3 real local routes reject long small PDF/DOCX before AI", async ({ page }, testInfo) => {
  for (const extension of ["pdf", "docx"]) {
    await page.goto("/"); await page.waitForLoadState("networkidle");
    await page.locator('#learning-source-file').setInputFiles(`test-results/v3-audit/fixtures/chars-20001.${extension}`);
    const ingestion = page.waitForResponse(r => r.url().endsWith("/api/sources"));
    const analysis = page.waitForResponse(r => r.url().endsWith("/api/analysis"));
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    expect((await ingestion).status()).toBe(200);
    expect((await analysis).status()).toBe(413);
    await expect(page.locator('.request-message[role="alert"]')).toContainText("20,000");
    await expect(page.getByText("Retry reuses this imported source.", { exact: false })).toBeVisible();
  }
  await page.screenshot({ path: `test-results/v3-audit/long-source-${testInfo.project.name}.png`, fullPage: true });
});

test("V3 native text controls at their input limits", async ({ page }, testInfo) => {
  const capture = JSON.parse(await readFile("test-results/v3-audit/analysis-live.json", "utf8"));
  await page.route("**/api/sources", route => route.fulfill({ json: { ok: true, schemaVersion: "1.0", data: capture.request.importedSource } }));
  await page.route("**/api/analysis", route => route.fulfill({ json: capture.response }));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  const source = page.getByLabel("Paste your learning material");
  await source.focus(); await page.keyboard.insertText("x".repeat(100001));
  const sourceAccepted = (await source.inputValue()).length;
  await source.fill(capture.request.importedSource.normalizedText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  const learner = page.getByLabel("Explanation text");
  await learner.focus(); await page.keyboard.insertText("x".repeat(10001));
  const learnerAccepted = (await learner.inputValue()).length;
  const result = { provenance: "Browser native insertText, not an API call or a live clipboard-paste test", sourceSubmitted: 100001, sourceAccepted, learnerSubmitted: 10001, learnerAccepted, visibleError: await page.locator('.request-message[role="alert"]').count() };
  await writeFile(`test-results/v3-audit/native-input-${testInfo.project.name}.json`, JSON.stringify(result, null, 2));
  expect(sourceAccepted).toBe(100000); expect(learnerAccepted).toBe(10000);
});
