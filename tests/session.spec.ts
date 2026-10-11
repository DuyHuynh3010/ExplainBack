import { test, expect, type Page } from "@playwright/test";
import { importText } from "../src/backend/sources/ingest";
import type { ImportedSource } from "../src/backend/contracts/domain";
import { mockAnalysis } from "./ui-source-fixture";
import { toReferenceFlow } from "../src/lib/reference-graph";
test.use({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3000"}` });
const sourceText = "Glucose stores energy. Glucose stores energy.\n\nChlorophyll absorbs light.";
const success = (data: unknown) => JSON.stringify({ ok: true, schemaVersion: "2.0", data });
const failure = JSON.stringify({ ok: false, schemaVersion: "2.0", error: { code: "AI_RATE_LIMITED", message: "Provider quota reached.", retryable: true } });

async function mockSource(page: Page) {
  await page.route("**/api/sources", route => {
    const payload = route.request().postDataJSON();
    return route.fulfill({ contentType: "application/json", body: success(importText(payload.source.text, payload.source.title)) });
  });
}
async function mockAI(page: Page) {
  await page.route("**/api/analysis", route => route.fulfill({ contentType: "application/json", body: success(mockAnalysis(route.request().postDataJSON().importedSource)) }));
}
async function enterSource(page: Page) {
  await page.goto("/");
  await page.getByLabel("Lesson title").fill("My source lesson");
  await page.getByLabel("Paste your learning material").fill(sourceText);
}
async function checkNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("mock: complete source session, topic/summary/evidence, preserved explanation and reset", async ({ page }, info) => {
  let imports = 0, analyses = 0;
  let firstStatementId = "";
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/sources", route => {
    imports++;
    const body = route.request().postDataJSON();
    expect(body.source.title).toBe("My source lesson");
    return route.fulfill({ contentType: "application/json", body: success(importText(body.source.text, body.source.title)) });
  });
  await page.route("**/api/analysis", route => {
    analyses++;
    const body = route.request().postDataJSON();
    expect(body.schemaVersion).toBe("2.0");
    expect(body.importedSource.normalizedText).toBe(sourceText);
    expect(body.importedSource.originalSegments).toHaveLength(1);
    const analysis = mockAnalysis(body.importedSource);
    firstStatementId = analysis.graph.statements[0].id;
    return route.fulfill({ contentType: "application/json", body: success(analysis) });
  });
  await enterSource(page);
  await page.screenshot({ path: `test-results/source-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Topic summary" })).toContainText("Synthetic energy summary");
  await expect(page.locator(".summary-item")).toHaveCount(0);
  await expect(page.locator(".status-badge")).toHaveCount(0);
  await expect(page.getByLabel("Source warnings")).toContainText("AMBIGUOUS_EVIDENCE");
  const details = page.getByRole("complementary", { name: "Source relationship details" });
  await expect(details).toContainText("unverified");
  await expect(details).not.toContainText("Page 1");
  await page.getByRole("button", { name: "Synthetic parallel assertion Source", exact: true }).click();
  await expect(details).toContainText("Negated");
  await expect(details).toContainText("Under the stated source condition");
  // Select the React Flow interaction path itself, not just the accessible list.
  const path = page.locator(`.react-flow__edge[data-id="${firstStatementId}"] .react-flow__edge-interaction`);
  await path.scrollIntoViewIfNeeded();
  const point = await path.evaluate(element => {
    const path = element as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(details).toContainText("Synthetic source assertion 1");
  await page.getByLabel("Topic", { exact: true }).selectOption({ label: "Light" });
  await expect(page.getByRole("article", { name: "Topic summary" })).toContainText("Synthetic light summary");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(details).toContainText("Synthetic light assertion");
  await checkNoOverflow(page);
  await page.screenshot({ path: `test-results/reference-map-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill("My own explanation stays in the session.");
  await expect(page.getByRole("button", { name: "Evaluate", exact: true })).toBeEnabled();
  await page.getByLabel("Upload your explanation").setInputFiles({ name: "explanation.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("Local file") });
  await page.getByRole("button", { name: "Back to analysis" }).click();
  await expect(page.getByLabel("Topic", { exact: true }).locator("option:checked")).toHaveText("Light");
  await page.getByRole("button", { name: "Back to source" }).click();
  await expect(page.getByLabel("Paste your learning material")).toHaveValue(sourceText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await expect(page.getByText("explanation.docx", { exact: true })).toBeVisible();
  expect(imports).toBe(1); expect(analyses).toBe(1);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByLabel("Lesson title")).toHaveValue("");
  await expect(page.getByLabel("Paste your learning material")).toHaveValue("");
  await page.getByRole("button", { name: "Load sample lesson" }).click();
  await expect(page.getByLabel("Lesson title")).not.toHaveValue("");
  expect(errors).toEqual([]);
});

test("mock: analysis error retry reuses the exact ImportedSource and never shows fixtures", async ({ page }) => {
  await mockSource(page);
  let count = 0;
  let submitted: unknown;
  let imports = 0;
  page.on("request", request => { if (request.url().endsWith("/api/sources")) imports++; });
  await page.route("**/api/analysis", route => {
    count++;
    const body = route.request().postDataJSON();
    if (count === 1) { submitted = body.importedSource; return route.fulfill({ status: 429, contentType: "application/json", body: failure }); }
    expect(body.importedSource).toEqual(submitted);
    return route.fulfill({ contentType: "application/json", body: success(mockAnalysis(body.importedSource)) });
  });
  await enterSource(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("AI_RATE_LIMITED");
  await expect(page.getByText("Retry reuses this imported source.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Paste your learning material")).toHaveValue(sourceText);
  await expect(page.getByRole("heading", { name: "Reference graph" })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
  expect(imports).toBe(1); expect(count).toBe(2);
});

test("mock: importing failure keeps input and retries ingestion", async ({ page }) => {
  await mockAI(page);
  let count = 0;
  await page.route("**/api/sources", route => {
    count++;
    if (count === 1) return route.fulfill({ status: 422, contentType: "application/json", body: failure });
    const body = route.request().postDataJSON();
    return route.fulfill({ contentType: "application/json", body: success(importText(body.source.text)) });
  });
  await enterSource(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".error-message")).toBeVisible();
  await expect(page.getByLabel("Paste your learning material")).toHaveValue(sourceText);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible(); expect(count).toBe(2);
});

for (const delayedPhase of ["sources", "analysis"] as const) {
  test(`mock: ${delayedPhase} loading, duplicate guard and stale response after source edit`, async ({ page }) => {
    // Make transport deliberately ignore cancellation, proving the revision guard independently.
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = (input, init) => original(input, { ...init, signal: undefined });
    });
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    await page.route("**/api/sources", async route => {
      const body = route.request().postDataJSON();
      if (delayedPhase === "sources" && body.source.text === sourceText) { calls++; await gate; }
      await route.fulfill({ contentType: "application/json", body: success(importText(body.source.text, body.source.title)) });
    });
    await page.route("**/api/analysis", async route => {
      const source: ImportedSource = route.request().postDataJSON().importedSource;
      if (delayedPhase === "analysis" && source.normalizedText === sourceText) { calls++; await gate; }
      await route.fulfill({ contentType: "application/json", body: success(mockAnalysis(source)) });
    });
    await enterSource(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("button", { name: delayedPhase === "sources" ? "Importing…" : "Analyzing…", exact: true })).toBeDisabled();
    await page.getByLabel("Paste your learning material").fill("New source fact.");
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
    const staleResponse = page.waitForResponse(response => {
      if (!response.url().endsWith(`/api/${delayedPhase}`)) return false;
      const body = response.request().postDataJSON();
      return delayedPhase === "sources" ? body.source.text === sourceText : body.importedSource.normalizedText === sourceText;
    });
    release();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText("New source fact.");
    await page.getByRole("button", { name: "Back to source" }).click();
    await expect(page.getByLabel("Paste your learning material")).toHaveValue("New source fact.");
    expect(calls).toBe(1);
  });
}

test("mock: cancel/reset during analysis prevents late results and clears the full session", async ({ page }) => {
  await mockSource(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/analysis", async route => { await gate; await route.fulfill({ contentType: "application/json", body: success(mockAnalysis(route.request().postDataJSON().importedSource)) }).catch(() => {}); });
  await enterSource(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analyzing…", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel processing" }).click();
  await expect(page.getByLabel("Paste your learning material")).toHaveValue(sourceText);
  await page.getByRole("button", { name: "Start over" }).click();
  release();
  await expect(page.getByLabel("Paste your learning material")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Reference graph" })).toHaveCount(0);
});

for (const name of ["partial.pdf", "paragraphs-table.docx"]) {
  test(`real ingestion + mocked AI: upload ${name} with warnings and original evidence locations`, async ({ page }) => {
    let imported: ImportedSource | undefined;
    await page.route("**/api/analysis", route => {
      imported = route.request().postDataJSON().importedSource;
      return route.fulfill({ contentType: "application/json", body: success(mockAnalysis(imported!)) });
    });
    await page.goto("/"); await page.getByLabel("Lesson title").fill("Uploaded source");
    await page.getByLabel("Upload learning material").setInputFiles(`tests/sources/fixtures/${name}`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Reference graph" })).toBeVisible();
    expect(imported!.document.title).toBe("Uploaded source");
    expect(imported!.metadata.extractor).toBe(name.endsWith("pdf") ? "unpdf" : "mammoth");
    await expect(page.getByLabel("Source warnings")).toContainText(name.endsWith("pdf") ? "EMPTY_PDF_PAGE" : "DOCX_EXTRACTION_WARNING");
    const details = page.getByRole("complementary", { name: "Source relationship details" });
    await expect(details).toContainText("Paragraph 1");
    if (name.endsWith("pdf")) await expect(details).toContainText("Page 1");
    else await expect(details).not.toContainText("Page 1");
    await checkNoOverflow(page);
  });
}

test("source picker rejects unsupported and oversized files and reset clears errors", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Upload learning material").setInputFiles({ name: "lesson.doc", mimeType: "application/msword", buffer: Buffer.from("Unsupported") });
  await expect(page.locator(".error-message")).toContainText("Choose a PDF or Word (.docx)");
  await page.getByLabel("Upload learning material").setInputFiles({ name: "large.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(3_000_001) });
  await expect(page.locator(".error-message")).toContainText("3,000,000 bytes");
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator(".error-message")).toHaveCount(0);
});

test("mock: recording/playback and typed explanation work without transcription/evaluation requests", async ({ page }) => {
  await mockSource(page); await mockAI(page);
  const unavailableCalls: string[] = [];
  page.on("request", r => { if (/\/api\/(transcriptions|evaluations)/.test(r.url())) unavailableCalls.push(r.url()); });
  await page.addInitScript(() => {
    const track = { stop() {} };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported() { return true; }
      state: RecordingState = "inactive"; mimeType = "audio/webm";
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob(["synthetic audio"], { type: this.mimeType }) })); this.dispatchEvent(new Event("stop")); }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  });
  await enterSource(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByText("Recording from your microphone")).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("audio")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create transcript" })).toBeEnabled();
  await page.getByLabel("Explanation text").fill("My explanation.");
  await expect(page.getByRole("button", { name: "Evaluate", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Back to analysis" }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await expect(page.getByLabel("Explanation text")).toHaveValue("My explanation.");
  await expect(page.locator("audio")).toBeVisible();
  await checkNoOverflow(page);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByText("Recording from your microphone")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByLabel("Paste your learning material").fill(sourceText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByLabel("Explanation text")).toHaveValue("");
  expect(unavailableCalls).toEqual([]);
});

test("adapter retains directed parallel edges, topic scope, neutral data and backend immutability", () => {
  const analysis = mockAnalysis(importText(sourceText));
  const original = structuredClone(analysis);
  const flow = toReferenceFlow(analysis.graph, analysis.graph.topics[0].id);
  expect(flow.nodes).toHaveLength(2);
  expect(flow.edges).toHaveLength(4);
  expect(new Set(flow.edges.map(e => e.id)).size).toBe(4);
  expect(new Set(flow.edges.slice(0, 3).map(e => e.data!.offset)).size).toBe(3);
  expect(flow.edges.find(e => e.label === "not retains · Under the stated source condition")).toBeTruthy();
  const reverse = flow.edges.find(e => e.label === "returns to")!;
  expect(reverse.source).toBe(flow.edges[0].target);
  expect(reverse.target).toBe(flow.edges[0].source);
  expect(flow.edges.every(e => !("status" in e.data!))).toBe(true);
  expect(analysis).toEqual(original);
  const loops = structuredClone(analysis.graph);
  loops.statements = loops.statements.slice(0, 2).map(s => ({ ...s, representation: s.representation.kind === "binary" ? { ...s.representation, objectConceptId: s.representation.subjectConceptId } : s.representation }));
  const loopEdges = toReferenceFlow(loops, loops.topics[0].id).edges;
  expect(loopEdges.every(e => e.data!.selfLoop)).toBe(true);
  expect(loopEdges[0].data!.offset).not.toBe(loopEdges[1].data!.offset);
});

test("mock: changing an analyzed source invalidates graph and explanation, and reimports", async ({ page }) => {
  await mockSource(page); await mockAI(page);
  let imports = 0;
  page.on("request", r => { if (r.url().endsWith("/api/sources")) imports++; });
  await enterSource(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByLabel("Explanation text").fill("Explanation of the old source.");
  await page.getByRole("button", { name: "Back to analysis" }).click();
  await page.getByRole("button", { name: "Back to source" }).click();
  await page.getByLabel("Lesson title").fill("Changed title");
  await expect(page.getByText("Source imported", { exact: false })).toHaveCount(0);
  await page.getByLabel("Paste your learning material").fill("Updated source text.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Source relationship details" })).toContainText("Updated source text.");
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await expect(page.getByLabel("Explanation text")).toHaveValue("");
  expect(imports).toBe(2);
});

test("mock: malformed successful AI response is rejected without demo fallback", async ({ page }) => {
  await mockSource(page);
  await page.route("**/api/analysis", route => route.fulfill({ contentType: "application/json", body: success({ graph: {} }) }));
  await enterSource(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("invalid response");
  await expect(page.getByRole("heading", { name: "Reference graph" })).toHaveCount(0);
  await expect(page.getByLabel("Paste your learning material")).toHaveValue(sourceText);
});

test("mock: microphone denial keeps the manual explanation input available", async ({ page }) => {
  await mockSource(page); await mockAI(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { throw new DOMException("Denied", "NotAllowedError"); } } });
  });
  await enterSource(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Write your explanation" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("Microphone access was denied");
  await page.getByLabel("Explanation text").fill("Manual explanation still works.");
  await expect(page.getByLabel("Explanation text")).toHaveValue("Manual explanation still works.");
});
