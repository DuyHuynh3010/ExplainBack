import { test, expect } from "@playwright/test";
import { sampleSource, sampleTranscript, relationships, statuses } from "../src/fixtures/photosynthesis";

test("fixture evidence and summary are consistent", () => {
 expect(relationships).toHaveLength(5);
 expect(statuses.map(s => relationships.filter(r => r.status === s).length)).toEqual([2, 1, 1, 1]);
 for (const r of relationships) {
  expect(sampleSource).toContain(r.quote);
  if (r.statement) expect(sampleTranscript).toContain(r.statement);
  else expect(r.status).toBe("missing");
 }
});

test("complete local session, preserved editing, selectable evidence and reset", async ({ page }) => {
 const errors: string[] = [];
 const externalRequests: string[] = [];
 let evaluationAttempts = 0;
 let submittedBody = "";
 let submittedContentType = "";
 await page.route("**/api/evaluations", async route => {
  evaluationAttempts += 1;
  submittedBody = route.request().postDataBuffer()?.toString("utf8") ?? "";
  submittedContentType = route.request().headers()["content-type"] ?? "";
  if (evaluationAttempts === 1) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Evaluation service is unavailable." }) });
  else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ evaluationId: "evaluation-1" }) });
 });
 page.on("pageerror", e => errors.push(e.message));
 page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
 page.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:3000") && !r.url().startsWith("data:")) externalRequests.push(r.url()); });
 await page.addInitScript(() => { Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => { throw new Error("Unexpected microphone access"); } } }); });
 await page.goto("/");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: `test-results/source-${test.info().project.name}.png`, fullPage: true });
 await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
 await page.getByLabel("Paste your learning material").fill("   ");
 await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
 await page.getByLabel("Upload learning material").setInputFiles({ name: "lesson.pdf", mimeType: "application/pdf", buffer: Buffer.from("PDF learning source") });
 await expect(page.getByText("lesson.pdf", { exact: true })).toBeVisible();
 await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
 await page.screenshot({ path: `test-results/source-upload-${test.info().project.name}.png`, fullPage: true });
 await page.getByLabel("Lesson title").fill("My biology notes");
 await page.getByRole("button", { name: "Continue", exact: true }).click();
 await expect(page.getByRole("heading", { name: "My biology notes" })).toBeVisible();
 await page.getByRole("button", { name: "Back", exact: true }).click();
 await expect(page.getByText("lesson.pdf", { exact: true })).toBeVisible();
 await expect(page.getByLabel("Paste your learning material")).toHaveValue("");
 await page.getByRole("button", { name: "Continue", exact: true }).click();
 await expect(page.getByText("PDF, Word (.doc, .docx), or Google Docs (.gdoc)", { exact: true })).toBeVisible();
 await expect(page.getByRole("button", { name: "Evaluate", exact: true })).toBeDisabled();
 await page.getByLabel("Upload your explanation").setInputFiles({ name: "explanation.txt", mimeType: "text/plain", buffer: Buffer.from("Not accepted") });
 await expect(page.locator(".error-message")).toContainText("Choose a PDF, Word (.doc or .docx), or Google Docs (.gdoc) file.");
 await expect(page.getByRole("button", { name: "Evaluate", exact: true })).toBeDisabled();
 for (const acceptedFile of [
  { name: "explanation.doc", mimeType: "application/msword" },
  { name: "explanation.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { name: "explanation.gdoc", mimeType: "application/octet-stream" },
 ]) {
  await page.getByLabel("Upload your explanation").setInputFiles({ ...acceptedFile, buffer: Buffer.from("Accepted explanation") });
  await expect(page.getByText(acceptedFile.name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Remove ${acceptedFile.name}` }).click();
 }
 await page.getByLabel("Upload your explanation").setInputFiles({ name: "explanation.pdf", mimeType: "application/pdf", buffer: Buffer.from("PDF explanation content") });
 await expect(page.getByText("explanation.pdf", { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.getByRole("button", { name: "Evaluate", exact: true }).click();
 await expect(page.locator(".error-message")).toContainText("Evaluation service is unavailable. Your file has been kept.");
 await expect(page.getByText("explanation.pdf", { exact: true })).toBeVisible();
 await page.screenshot({ path: `test-results/explanation-${test.info().project.name}.png`, fullPage: true });
 expect(submittedContentType).toContain("multipart/form-data; boundary=");
 expect(submittedBody).toContain('name="lessonTitle"');
 expect(submittedBody).toContain("My biology notes");
 expect(submittedBody).toContain('name="learningSource"');
 expect(submittedBody).toContain('name="learningSourceFile"; filename="lesson.pdf"');
 expect(submittedBody).toContain("PDF learning source");
 expect(submittedBody).toContain('name="explanationFile"; filename="explanation.pdf"');
 expect(submittedBody).toContain("PDF explanation content");
 errors.length = 0; // The intentionally mocked 503 is surfaced and handled above.
 await page.getByRole("button", { name: "Back", exact: true }).click();
 await expect(page.getByLabel("Lesson title")).toHaveValue("My biology notes");
 await expect(page.getByText("lesson.pdf", { exact: true })).toBeVisible();
 await page.getByRole("button", { name: "Continue", exact: true }).click();
 await expect(page.getByText("explanation.pdf", { exact: true })).toBeVisible();
 await page.getByRole("button", { name: "Evaluate", exact: true }).click();
 await expect(page.getByRole("heading", { name: "See how the ideas connect." })).toBeVisible();
 expect(evaluationAttempts).toBe(2);
 await expect(page.getByText("Sample results for the photosynthesis demo. These are not an evaluation of your input.")).toBeVisible();
 for (const r of relationships) {
  await page.getByRole("button", { name: `${r.expected} ${r.status}`, exact: false }).click();
  const details = page.getByRole("complementary", { name: "Relationship details" });
  await expect(details.getByRole("heading", { name: r.expected })).toBeVisible();
  await expect(details.getByText(`“${r.quote}”`, { exact: true })).toBeVisible();
  if (!r.statement) await expect(details.getByText("Not mentioned", { exact: true })).toBeVisible();
 }
 await expect(page.locator(".summary-item strong")).toHaveText(["2", "1", "1", "1"]);
 const firstRelationship = page.getByRole("button", { name: `${relationships[0].expected} correct` });
 await firstRelationship.focus();
 await page.keyboard.press("Enter");
 await expect(firstRelationship).toHaveAttribute("aria-pressed", "true");
 await page.screenshot({ path: `test-results/map-${test.info().project.name}.png`, fullPage: true });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.getByRole("button", { name: "Start over" }).click();
 await expect(page.getByLabel("Lesson title")).toHaveValue("");
 await expect(page.getByLabel("Paste your learning material")).toHaveValue("");
 await page.getByRole("button", { name: "Load sample lesson" }).click();
 await page.getByRole("button", { name: "Continue", exact: true }).click();
 await expect(page.getByText("explanation.pdf", { exact: true })).toHaveCount(0);
 await expect(page.getByRole("button", { name: "Evaluate", exact: true })).toBeDisabled();
 expect(errors).toEqual([]);
 expect(externalRequests).toEqual([]);
});
