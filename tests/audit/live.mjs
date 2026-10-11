/** Explicit V3 audit opt-in: one analysis + three evaluations, no repair/retry. */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { sourceText, explanations } from "./v3-fixtures.mjs";
const require = createRequire(import.meta.url);
if (process.env.RUN_V3_AUDIT !== "1") throw new Error("Set RUN_V3_AUDIT=1 only for an explicitly authorized four-generation audit.");
require("@next/env").loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const load = file => require(`../../test-results/analysis-build/backend/${file}.js`);
const { importText } = load("sources/ingest");
const { createGeminiProvider } = load("analysis/gemini");
const { handleAnalysisRequest } = load("analysis/handler");
const { handleEvaluationRequest } = load("explanations/evaluation");
const { AnalysisError } = load("analysis/errors");
const dest = "test-results/v3-audit";
mkdirSync(dest, { recursive: true });
const importedSource = importText(sourceText, "V3 semantic audit");
const records = [];
let calls = 0;
let sourceAnalysis;
const jsonRequest = (path, value) => new Request(`http://audit/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
console.log(JSON.stringify({ model: process.env.GEMINI_MODEL, keyExists: !!process.env.GEMINI_API_KEY?.trim(), retryAttempts: 1, repair: false, thinking: "SDK/model default; no explicit thinkingConfig", timeoutMs: 60000 }));
for (const name of ["analysis", "short", "paraphrase", "contradiction"]) {
  const events = [];
  const diagnostic = event => events.push(event);
  const actual = createGeminiProvider(process.env, undefined, diagnostic);
  let operationCalls = 0, draft;
  const provider = { async generate(request) {
    // The analysis pipeline may request repair; block it BEFORE the SDK call.
    if (operationCalls >= 1 || calls >= 4) throw new AnalysisError("AI_OUTPUT_INVALID", 502, "Audit disabled repair and enforced its generation budget.");
    operationCalls++; calls++;
    const result = await actual.generate(request);
    try { draft = JSON.parse(result.text); } catch { draft = { invalidJson: true, outputCharacters: result.text.length }; }
    return result;
  } };
  const value = name === "analysis" ? { schemaVersion: "1.0", importedSource, outputLanguage: "en" } : { schemaVersion: "1.0", importedSource, sourceAnalysis, topicIds: sourceAnalysis.graph.topics.map(t => t.id), learner: { text: explanations[name] } };
  const started = Date.now();
  const response = name === "analysis" ? await handleAnalysisRequest(jsonRequest("analysis", value), () => provider) : await handleEvaluationRequest(jsonRequest("evaluations", value), provider);
  const payload = await response.json();
  const record = { name, elapsedMs: Date.now() - started, httpStatus: response.status, code: payload.error?.code, message: payload.error?.message, retryAfter: response.headers.get("retry-after"), generations: operationCalls, totalGenerations: calls, requestBytes: Buffer.byteLength(JSON.stringify(value)), events };
  records.push(record);
  writeFileSync(`${dest}/${name}-live.json`, JSON.stringify({ provenance: "real Gemini; production handlers with capped test-only provider injection", request: value, draft, response: payload, record }, null, 2));
  writeFileSync(`${dest}/live-ledger.json`, JSON.stringify({ model: process.env.GEMINI_MODEL, calls, records }, null, 2));
  console.log(JSON.stringify(record));
  if (payload.ok && name === "analysis") sourceAnalysis = payload.data;
  // Stop on quota, overload or deadline; never interpret these as schema proof.
  if (!payload.ok && (name === "analysis" || [429, 503, 504].includes(response.status))) break;
}
