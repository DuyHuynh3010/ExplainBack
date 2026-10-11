/** One explicitly authorized semantic repair of an immutable captured real draft.
 * No hand-corrected output, no fallback, no second generation. */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
if (process.env.RUN_GRAPH_V2_REPAIR !== "1" || !process.env.EXPLAINBACK_LIVE_BUDGET_FILE) throw new Error("Explicit opt-in and transport guard required.");
const budget = JSON.parse(readFileSync(process.env.EXPLAINBACK_LIVE_BUDGET_FILE, "utf8"));
if (budget.calls !== 3 || budget.stopped) throw new Error("Expected exactly one remaining generation.");
require("@next/env").loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const load = p => require(`../../test-results/analysis-build/backend/${p}.js`);
const { createGeminiProvider } = load("analysis/gemini");
const { buildAnalysisPrompt, ANALYSIS_SYSTEM_INSTRUCTION } = load("analysis/prompt");
const { ANALYSIS_DRAFT_SCHEMA, parseDraft } = load("analysis/draft");
const { normalizeAnalysisDraft } = load("analysis/normalize");
const { ANALYSIS_LIMITS } = load("analysis/limits");
const { inspectRepeatedAssertions } = load("contracts/statement-quality");
const capture = JSON.parse(readFileSync("test-results/source-analysis-artifacts/6e96ab31-6234-4286-ab59-e22d3eb69db3-call-1.json", "utf8"));
const draft = capture.draft, request = { schemaVersion: "2.0", importedSource: capture.importedSource };
const issues = inspectRepeatedAssertions(draft.statements, draft.concepts, "$.statements").map(({ severity, ...i }) => i);
// Explicit human audit findings refer to the unchanged captured output and source.
const audit = [
  [12, "representation.objectConceptId", "The assertion locates chloroplasts inside the plant cell, not plants as a whole. Preserve the actual location or a complete complex claim."],
  [13, "representation.objectConceptId", "The assertion says energy of sunlight; the endpoint says chemical energy. Those are not interchangeable by synonym."],
  [15, "representation", "The assertion is about chlorophyll giving green color to the plant. A bare gives edge to plants omits the color. Preserve every essential participant."],
  [17, "representation.objectConceptId", "The assertion requires sunlight, but the endpoint is chemical energy. Create/reuse the source-supported light concept instead of substituting another form of energy."],
  [18, "representation.objectConceptId", "The assertion describes energy from light waves; the target is chemical energy. Preserve input light versus converted chemical energy."],
  [21, "representation.objectConceptId", "The assertion does not require light. The target chemical energy changes that claim. Preserve polarity and the actual object."],
];
for (const [index, field, message] of audit) issues.push({ path: `$.statements[${index}].${field}`, code: "invariant", ids: { statementId: draft.statements[index].id }, message });
issues.push({ path: "$.blockDispositions", code: "invariant", message: "The C3/C4 block contains supported C4 intermediate, splitting and hot/dry adaptation claims but no C4 statement was retained. The source also states water oxidation, carbon dioxide reduction and reflected/absorbed light colors. Account for supported claims without solving exercises or omitting the license from input. Preserve coupled clauses as complex where appropriate." });
const events = [], result = { provenance: "One real generation repairing audited captured output; no hand-corrected model output", request, issues };
try {
  const response = await createGeminiProvider(process.env, undefined, e => events.push(e)).generate({
    systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
    prompt: buildAnalysisPrompt(request, { error: "Captured extraction has the concrete projection/coverage errors listed below.", issues, previousDraft: draft }),
    schema: ANALYSIS_DRAFT_SCHEMA, maxOutputTokens: ANALYSIS_LIMITS.outputTokens,
    signal: AbortSignal.timeout(ANALYSIS_LIMITS.callTimeoutMs),
  });
  result.raw = response.text; result.finishReason = response.finishReason;
  if (response.finishReason !== "stop") throw new Error(`Unusable finish reason: ${response.finishReason}`);
  result.draft = parseDraft(response.text);
  result.analysis = normalizeAnalysisDraft(request.importedSource, result.draft);
} catch (e) { result.failure = { code: e.code ?? "REPAIR_FAILED", message: e.message, issues: e.issues }; }
result.events = events;
writeFileSync("test-results/graph-v2/final-repair.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({ success: !!result.analysis, failure: result.failure, events, budget: JSON.parse(readFileSync(process.env.EXPLAINBACK_LIVE_BUDGET_FILE, "utf8")) }));
