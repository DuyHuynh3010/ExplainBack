/** Explicit opt-in, small paid smoke test. Never run as part of the mock suite. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
if (process.env.RUN_GEMINI_SMOKE !== "1") {
  console.log("Skipped live Gemini smoke test: set RUN_GEMINI_SMOKE=1 to opt in.");
} else if (!process.env.GEMINI_API_KEY?.trim() || !process.env.GEMINI_MODEL?.trim()) {
  console.log("Skipped live Gemini smoke test: GEMINI_API_KEY and GEMINI_MODEL are required.");
} else {
  const { importText } = require("../../test-results/analysis-build/backend/sources/ingest.js");
  const { analyzeImportedSource } = require("../../test-results/analysis-build/backend/analysis/pipeline.js");
  const { createGeminiProvider } = require("../../test-results/analysis-build/backend/analysis/gemini.js");
  try {
    const analysis = await analyzeImportedSource({ schemaVersion: "2.0", importedSource: importText("Glucose stores chemical energy. Chlorophyll absorbs light energy."), outputLanguage: "en" }, createGeminiProvider());
    console.log(JSON.stringify({ passed: true, topics: analysis.graph.topics.length, statements: analysis.graph.statements.length, verifiedEvidence: analysis.graph.evidence.filter(e => e.verification === "verified").length }));
  } catch (error) {
    // Do not print SDK errors, input text, credentials or prompts.
    console.error(JSON.stringify({ passed: false, code: error.code ?? "ANALYSIS_FAILED" }));
    process.exitCode = 1;
  }
}
