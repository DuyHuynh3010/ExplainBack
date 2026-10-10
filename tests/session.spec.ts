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
 await expect(page.getByRole("button", { name: "Upload PDF" })).toBeDisabled();
 await page.getByRole("button", { name: "Load sample lesson" }).click();
 await expect(page.getByLabel("Paste your learning material")).toHaveValue(sampleSource);
 await page.getByLabel("Lesson title").fill("My biology notes");
 await page.getByRole("button", { name: "Continue", exact: true }).click();
 await expect(page.getByRole("heading", { name: "My biology notes" })).toBeVisible();
 await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
 await page.getByRole("button", { name: "Start demo recording" }).click();
 await expect(page.getByLabel("Recording duration")).toHaveText("00:01", { timeout: 4000 });
 await page.getByRole("button", { name: "Stop", exact: true }).click();
 await expect(page.getByLabel("Your transcript")).toHaveValue(sampleTranscript);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.getByLabel("Your transcript").fill("My edited explanation.");
 await page.getByRole("button", { name: "Back", exact: true }).click();
 await expect(page.getByLabel("Lesson title")).toHaveValue("My biology notes");
 await expect(page.getByLabel("Paste your learning material")).toHaveValue(sampleSource);
 await page.getByRole("button", { name: "Continue", exact: true }).click();
 await expect(page.getByLabel("Your transcript")).toHaveValue("My edited explanation.");
 await page.getByRole("button", { name: "Preview sample results" }).click();
 await expect(page.getByRole("button", { name: "Loading sample results" })).toBeDisabled();
 await expect(page.getByRole("heading", { name: "See how the ideas connect." })).toBeVisible();
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
 await expect(page.getByLabel("Your transcript")).toHaveCount(0);
 await expect(page.getByLabel("Recording duration")).toHaveText("00:00");
 expect(errors).toEqual([]);
 expect(externalRequests).toEqual([]);
});
