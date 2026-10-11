/** Replay original v1 captures through a SHAPE-ONLY v2 migration; never call AI.
 * Synthetic valid outputs test mechanisms separately, not extraction accuracy. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { migrateLegacyDraft } from "./legacy-artifact.mjs";
import { globalDraft, globalSource } from "./global-fixture.mjs";
const require = createRequire(import.meta.url);
const load = file => require(`../../test-results/analysis-build/${file}.js`);
const { importText } = load("backend/sources/ingest");
const { parseDraft } = load("backend/analysis/draft");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { checkDraftReferences } = load("backend/analysis/draft-references");
const { inspectStatement } = load("backend/contracts/statement-quality");
const { locateQuote } = load("backend/analysis/evidence");
const { analyzeImportedSource } = load("backend/analysis/pipeline");
const { diagnosticIssues, createAnalysisCapture } = load("backend/analysis/diagnostics");
const { toReferenceFlow } = load("lib/reference-graph");
const { validateSourceAnalysis } = load("backend/contracts/validate");
const source = importText(readFileSync("tests/analysis/fixtures/multisection-source.txt", "utf8"));
function captured(file) {
  const original = JSON.parse(readFileSync(`tests/analysis/fixtures/${file}`, "utf8"));
  const d = migrateLegacyDraft(original);
  const block = id => source.document.blocks[Number(id.replace("block-", ""))].id;
  d.blockDispositions.forEach(b => { b.blockId = block(b.blockId); });
  d.statements.forEach(s => s.evidence.forEach(e => { e.blockId = block(e.blockId); }));
  return d;
}
const first = () => captured("multisection-failed-draft.json");
const last = () => captured("multisection-final-failed-draft.json");
const findings = d => d.statements.flatMap((s, i) => inspectStatement(s, d.concepts, `$.statements[${i}]`));
const fixture = () => { const imported = importText(globalSource); return { imported, draft: globalDraft(imported) }; };
const provider = values => ({ calls: [], async generate(r) { this.calls.push(r); return { text: JSON.stringify(values[this.calls.length - 1]), finishReason: "stop" }; } });

test("real captures: shared endpoint references now pass without cloning, redirecting or losing license", () => {
  for (const d of [first(), last()]) { const before = structuredClone(d); assert.doesNotThrow(() => checkDraftReferences(d)); assert.deepEqual(d, before); }
  assert.match(source.normalizedText, /The National Geographic Society/);
});
test("real first draft: Chloroplasts self-loop, displaced Stroma and C4 targets fail explicitly", () => {
  const d = first(); const before = structuredClone(d), errors = findings(d).filter(i => i.severity === "error");
  for (const id of ["stmt_1", "stmt_4", "stmt_7", "stmt_9"]) assert.ok(errors.some(i => i.ids.statementId === id), id);
  assert.throws(() => normalizeAnalysisDraft(source, d), e => e.code === "AI_OUTPUT_INVALID" && e.issues.some(i => i.ids.statementId === "stmt_4"));
  assert.deepEqual(d, before);
});
test("real final draft: relation double negation is rejected, not silently stripped", () => {
  const d = last(); assert.ok(findings(d).some(i => i.ids.statementId === "s17" && i.path.endsWith("representation.relation") && i.severity === "error"));
  assert.equal(d.statements.find(s => s.id === "s17").representation.relation, "does not require");
});
test("real ATP/NADPH omission is observable; structural block coverage cannot prove completeness", () => {
  const d = first(), used = new Set(d.statements.flatMap(s => [s.representation.subjectConceptId, s.representation.objectConceptId]));
  for (const name of ["ATP", "NADPH"]) assert.ok(d.concepts.some(c => c.name === name && !used.has(c.id)));
  const { imported, draft } = fixture(); draft.concepts.push({ id: "unused", name: "Unused concept", aliases: [] });
  assert.ok(normalizeAnalysisDraft(imported, draft).analysisWarnings.some(w => w.code === "UNUSED_CONCEPT"));
});
test("unique quotes ignore bad optional contexts and derive exact UTF-16 contexts; repeated/absent stay distinct", () => {
  const { imported, draft } = fixture(); const e = draft.statements[2].evidence[0]; e.contextBefore = "not adjacent"; e.contextAfter = "also wrong";
  const result = normalizeAnalysisDraft(imported, draft), located = result.graph.evidence.find(x => x.quote === e.quote);
  assert.equal(located.verification, "verified"); assert.notEqual(located.contextAfter, e.contextAfter);
  const prefix = String.fromCodePoint(0x1f33f) + " "; const text = prefix + "Same. Then Same.";
  assert.equal(locateQuote(text, { quote: "Same." }).range, undefined);
  assert.equal(locateQuote(text, { quote: "Same.", contextBefore: "wrong" }).range, undefined);
  assert.equal(locateQuote(text, { quote: "Same.", contextBefore: prefix }).range.start, 3);
  assert.equal(locateQuote(text, { quote: "Absent" }).occurrences, 0);
  e.contextBefore = ""; assert.equal(parseDraft(JSON.stringify(draft)).statements[2].evidence[0].contextBefore, undefined);
  e.quote = "Not in the source"; assert.throws(() => normalizeAnalysisDraft(imported, draft), e => e.issues.some(i => i.code === "evidence"));
});
test("global identity, safe split, complex participants and source order survive normalization and topic views", () => {
  const { imported, draft } = fixture(), before = structuredClone(draft), result = normalizeAnalysisDraft(imported, draft);
  assert.deepEqual(draft, before); assert.deepEqual(result.document, imported.document);
  assert.equal(result.graph.topics[0].title, "Products");
  const glucose = result.graph.concepts.find(c => c.name === "Glucose");
  for (const topic of result.graph.topics) {
    const flow = toReferenceFlow(result.graph, topic.id);
    assert.ok(flow.nodes.some(n => n.id === `${result.graph.id}:${glucose.id}`));
    const selected = result.graph.statements.filter(s => s.topicId === topic.id);
    assert.equal(flow.edges.length, selected.filter(s => s.representation.kind === "binary").length);
    const used = new Set(selected.flatMap(s => s.representation.kind === "binary" ? [s.representation.subjectConceptId, s.representation.objectConceptId] : s.representation.participants.map(p => p.conceptId)));
    assert.equal(flow.nodes.length, used.size);
  }
  assert.equal(result.graph.statements.filter(s => s.representation.kind === "complex").length, 1);
  assert.equal(validateSourceAnalysis(result).valid, true);
  mkdirSync("test-results/graph-v2", { recursive: true });
  writeFileSync("test-results/graph-v2/offline.json", JSON.stringify({ provenance: "Synthetic v2 fixture, no AI", importedSource: imported, analysis: result }, null, 2));
  const invalid = structuredClone(result); invalid.graph.concepts[0].documentId = "foreign";
  assert.equal(validateSourceAnalysis(invalid).valid, false);
});
test("identity never merges Energy with Chemical energy or distinct homonym IDs", () => {
  const { imported, draft } = fixture(); draft.concepts.push({ id: "energy", name: "Energy", aliases: [] }, { ...draft.concepts[3], id: "distinct-sense" }, structuredClone(draft.concepts[0]));
  const r = normalizeAnalysisDraft(imported, draft); assert.equal(r.graph.concepts.length, 9);
  assert.equal(r.graph.concepts.filter(c => c.name === "Chemical energy").length, 2);
});
test("literal wrong stores endpoint fails, alias/coreference and genuine self-loop remain valid", () => {
  const { imported, draft } = fixture(); draft.statements[2].representation.objectConceptId = "c0";
  assert.throws(() => normalizeAnalysisDraft(imported, draft), e => e.issues.some(i => i.ids.statementId === "stores"));
  const concepts = [{ id: "x", name: "System", aliases: ["Machine"] }];
  const s = { id: "s", representation: { kind: "binary", subjectConceptId: "x", objectConceptId: "x", relation: "regulates" }, assertion: "Machine regulates itself.", negated: false, conditions: [] };
  assert.equal(inspectStatement(s, concepts, "$s").filter(i => i.severity === "error").length, 0);
});
test("specific repair issues preserve IDs; final validation and private diagnostic captures remain bounded", async () => {
  const { imported, draft } = fixture(), bad = structuredClone(draft); bad.statements[2].representation.objectConceptId = "c0";
  const patch = { concepts: [], statements: [draft.statements[2]], lessonSections: draft.lessonSections.filter(s => s.topicId === draft.statements[2].topicId) };
  const p = provider([bad, patch]), captures = [], events = [];
  await analyzeImportedSource({ schemaVersion: "2.0", importedSource: imported }, p, { retryDelayMs: 0, capture: c => captures.push(c), diagnostic: e => events.push(e) });
  assert.equal(p.calls.length, 2); const repair = JSON.parse(p.calls[1].prompt).repair;
  assert.equal(repair.previousDraft, undefined); assert.deepEqual(repair.statements, [bad.statements[2]]); assert.equal(repair.issues[0].ids.statementId, "stores");
  assert.ok(repair.issues[0].path.includes("representation.objectConceptId")); assert.ok(captures[1].normalized);
  assert.ok(!JSON.stringify(events).includes(globalSource));
  const prev = process.env.EXPLAINBACK_ANALYSIS_CAPTURE;
  try { delete process.env.EXPLAINBACK_ANALYSIS_CAPTURE; assert.equal(createAnalysisCapture("audit"), undefined); }
  finally { if (prev !== undefined) process.env.EXPLAINBACK_ANALYSIS_CAPTURE = prev; }
  assert.ok(!JSON.stringify(diagnosticIssues([{ path: "$", code: "evidence", message: "private quote" }])).includes("private quote"));
});
test("unknown endpoint and cross-topic lesson links retain precise validation paths", () => {
  const { imported, draft } = fixture(); draft.statements[0].representation.objectConceptId = "unknown";
  assert.throws(() => normalizeAnalysisDraft(imported, draft), e => e.issues[0].path === "$.statements[0].representation.objectConceptId");
  draft.statements[0].representation.objectConceptId = "c1"; draft.lessonSections[0].statementIds.push("glucose");
  assert.throws(() => normalizeAnalysisDraft(imported, draft), e => e.issues.some(i => i.path.includes("lessonSections[0].statementIds")));
});


test("an unsplit conjunctive assertion cannot be copied onto distinct binary projections", () => {
  const { imported, draft } = fixture();
  draft.statements[0].assertion = draft.statements[1].assertion = "Photosynthesis produces glucose and oxygen.";
  assert.throws(() => normalizeAnalysisDraft(imported, draft), e => e.issues.some(i => i.path.endsWith("assertion") && i.message.includes("conjunctive")));
});
test("unverified evidence cannot carry a false range; v1 is rejected rather than guessed", () => {
  const { imported, draft } = fixture(), result = normalizeAnalysisDraft(imported, draft);
  result.graph.evidence[0].verification = "unverified"; result.graph.evidence[0].location.charRange.start++;
  assert.equal(validateSourceAnalysis(result).valid, false);
  result.schemaVersion = "1.0"; assert.equal(validateSourceAnalysis(result).valid, false);
});
test("current saved real v2 output is rejected after the conjunction regression fix", t => {
  let saved;
  try { saved = JSON.parse(readFileSync("test-results/graph-v2/analysis-live-2.json", "utf8")); }
  catch (e) { if (e.code === "ENOENT") return t.skip("Local real capture absent; synthetic regression still runs."); throw e; }
  const result = validateSourceAnalysis(saved.response.data);
  assert.equal(result.valid, false); assert.ok(result.issues.some(i => i.message.includes("conjunctive")));
});
