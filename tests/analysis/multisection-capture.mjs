/** Explicit one-generation reproduction; saves local drafts, never repairs/retries. */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
if (process.env.RUN_MULTISECTION_CAPTURE !== "1") throw new Error("Explicit live capture opt-in required.");
require("@next/env").loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const load = name => require(`../../test-results/analysis-build/backend/${name}.js`);
const { importText } = load("sources/ingest");
const { createGeminiProvider } = load("analysis/gemini");
const { ANALYSIS_DRAFT_SCHEMA, parseDraft } = load("analysis/draft");
const { ANALYSIS_SYSTEM_INSTRUCTION, buildAnalysisPrompt } = load("analysis/prompt");
const { normalizeAnalysisDraft } = load("analysis/normalize");
const { ANALYSIS_LIMITS } = load("analysis/limits");
const validators = load("contracts/validate");
const originalValidate = validators.validateSourceAnalysis;
const events = [], snapshots = [];
// Observe the real validator without altering its result or production files.
validators.validateSourceAnalysis = value => {
  const validation = originalValidate(value);
  snapshots.push({ normalized: value, issues: validation.issues });
  return validation;
};
const importedSource = importText(readFileSync("tests/analysis/fixtures/multisection-source.txt", "utf8"), "Multi-section photosynthesis");
const request = { schemaVersion: "2.0", importedSource };
const dir = "test-results/multisection";
mkdirSync(dir, { recursive: true });
console.log(JSON.stringify({ model: process.env.GEMINI_MODEL, keyExists: !!process.env.GEMINI_API_KEY?.trim(), callsAllowed: 1, retryAttempts: 1, repair: false }));
let raw, draft, analysis, failure;
const started = Date.now();
try {
  const result = await createGeminiProvider(process.env, undefined, event => events.push(event)).generate({ systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION, prompt: buildAnalysisPrompt(request), schema: ANALYSIS_DRAFT_SCHEMA, maxOutputTokens: ANALYSIS_LIMITS.outputTokens, signal: AbortSignal.timeout(ANALYSIS_LIMITS.callTimeoutMs) });
  raw = result.text;
  if (result.finishReason !== "stop") throw new Error(`Unusable finish reason: ${result.finishReason}`);
  draft = parseDraft(raw);
  analysis = normalizeAnalysisDraft(importedSource, draft);
} catch (error) { failure = { code: error.code ?? "CAPTURE_FAILED", message: error.message }; }
finally { validators.validateSourceAnalysis = originalValidate; }
writeFileSync(`${dir}/initial.json`, JSON.stringify({ provenance: "One real SDK generation; no retry/repair; original validator result preserved", request, raw, draft, analysis, snapshots, failure, events, elapsedMs: Date.now() - started }, null, 2));
console.log(JSON.stringify({ elapsedMs: Date.now() - started, draftPassed: !!draft, normalizedPassed: !!analysis, failure, issues: snapshots.flatMap(s => s.issues), events }));
