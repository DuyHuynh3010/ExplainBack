/** Offline regression: synthetic verdicts/outputs do not prove live model quality. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { qualitySource, qualityDraft } from "./extraction-quality-fixture.mjs";
const require = createRequire(import.meta.url);
const load = file => require(`../../test-results/analysis-build/${file}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { parseDraft } = load("backend/analysis/draft");
const { analyzeImportedSource } = load("backend/analysis/pipeline");
const { inspectStatement } = load("backend/contracts/statement-quality");
const { reviewExtraction } = load("backend/analysis/review");
const { planStatementRepair, mergeStatementRepair, statementRepairPrompt } = load("backend/analysis/statement-repair");
const { validateSourceAnalysis, validateImportedAnalysisResponse } = load("backend/contracts/validate");
const { toReferenceFlow } = load("lib/reference-graph");
const { evaluationPrompt } = load("backend/explanations/evaluation");
const fixture = first => { const importedSource = importText(first ? qualitySource.split("\n")[0] : qualitySource); return { importedSource, draft: qualityDraft(importedSource, first), schemaVersion: "2.0" }; };
const run = async f => { let calls = 0; const analysis = await analyzeImportedSource({ schemaVersion: "2.0", importedSource: f.importedSource }, { async generate() { calls++; return { text: JSON.stringify(f.draft), finishReason: "stop" }; } }); return { analysis, calls }; };

for (const first of [true, false]) test(`synthetic pipeline: ${first ? "first paragraph" : "both paragraphs"} keeps source, qualifiers, participants and definitions`, async () => {
  const f = fixture(first), { analysis, calls } = await run(f);
  assert.equal(calls, 1); assert.equal(validateSourceAnalysis(analysis).valid, true);
  assert.deepEqual(analysis.document, f.importedSource.document);
  assert.equal(validateImportedAnalysisResponse({ schemaVersion: "2.0", importedSource: f.importedSource }, { ok: true, schemaVersion: "2.0", data: analysis }).valid, true);
  const byAssertion = text => analysis.graph.statements.find(s => s.assertion.includes(text));
  const bacteria = byAssertion("Some types of bacteria carry"); assert.ok(bacteria);
  const concept = analysis.graph.concepts.find(c => c.name === "Bacteria");
  assert.equal(analysis.graph.concepts.filter(c => c.name === "Bacteria").length, 1);
  assert.ok(analysis.graph.statements.some(s => s.representation.kind === "complex" && s.representation.participants.some(p => p.conceptId === concept.id)));
  const capture = byAssertion("capture energy from sunlight");
  assert.ok(capture.representation.participants.some(p => analysis.graph.concepts.find(c => c.id === p.conceptId).name === "Glucose"));
  for (const phrase of ["Most life on Earth", "stores chemical energy", "Herbivores obtain", "Carnivores obtain"]) assert.ok(byAssertion(phrase));
  if (!first) {
    for (const phrase of ["undergoes oxidation", "loses electrons", "undergoes reduction", "gains electrons", "Water transforms into oxygen", "Carbon dioxide transforms into glucose", "release oxygen into the air"]) assert.ok(byAssertion(phrase));
    const joint = byAssertion("from the air and soil"); assert.equal(joint.representation.kind, "complex");
    assert.ok(joint.conditions.some(c => c.includes("does not specify")));
    assert.ok(!analysis.analysisWarnings.some(w => w.message.includes("meaning")));
  }
  for (const e of analysis.graph.evidence) {
    const block = analysis.document.blocks.find(b => b.id === e.blockId);
    assert.equal(block.text.slice(e.location.charRange.start, e.location.charRange.end), e.quote);
  }
  if (!first) {
    mkdirSync("test-results/extraction-quality-v2", { recursive: true });
    writeFileSync("test-results/extraction-quality-v2/offline.json", JSON.stringify({ provenance: "Synthetic pipeline output, not live AI", importedSource: f.importedSource, draft: f.draft, analysis }, null, 2));
  }
});

test("scope remains on the source statement, graph label and evaluation input without cloning concepts", () => {
  const f = fixture(true), analysis = normalizeAnalysisDraft(f.importedSource, f.draft);
  const source = analysis.graph.statements.find(s => s.assertion.startsWith("Some types"));
  const flow = toReferenceFlow(analysis.graph, source.topicId), edge = flow.edges.find(e => e.id === source.id);
  assert.match(edge.label, /Some types of bacteria/); assert.equal(edge.data.assertion, source.assertion);
  const request = { schemaVersion: "2.0", importedSource: f.importedSource, sourceAnalysis: analysis, topicIds: analysis.graph.topics.map(t => t.id), learner: { text: "Some bacteria perform this process." } };
  const sent = JSON.parse(evaluationPrompt(request)).source.relationships.find(s => s.id === source.id);
  assert.deepEqual(sent.conditions, source.conditions); assert.equal(sent.assertion, source.assertion);
  source.conditions = []; assert.match(toReferenceFlow(analysis.graph, source.topicId).edges.find(e => e.id === source.id).label, /Some types of bacteria/);
});

test("complex missing carrier is reviewed, not redirected or rejected from word overlap", () => {
  const f = fixture(true), capture = f.draft.statements.find(s => s.id === "capture");
  capture.representation.participants = capture.representation.participants.filter(p => p.conceptId !== "glucose");
  const before = structuredClone(f.draft), reviews = reviewExtraction(f.importedSource, f.draft);
  assert.ok(reviews.some(r => r.draftStatementId === "capture" && r.warning.message.includes("absent from its participants")));
  assert.deepEqual(f.draft, before); assert.equal(validateSourceAnalysis(normalizeAnalysisDraft(f.importedSource, f.draft)).valid, true);
  f.draft.statements.find(s => s.id === "storage").evidence = structuredClone(capture.evidence);
  assert.ok(!reviewExtraction(f.importedSource, f.draft).some(r => r.draftStatementId === "capture" && r.warning.message.includes("absent from its participants")));
});

test("definition name alone triggers coverage review; literal-preserving claims remove that review", () => {
  const f = fixture(false);
  const complete = reviewExtraction(f.importedSource, f.draft);
  assert.ok(!complete.some(r => r.warning.message.includes("meaning")));
  f.draft.statements = f.draft.statements.filter(s => !["loses", "gains"].includes(s.id));
  assert.equal(reviewExtraction(f.importedSource, f.draft).filter(r => r.warning.message.includes("meaning")).length, 2);
  // A legitimate paraphrase is only reviewed, never called wrong by this cue.
  f.draft.statements.find(s => s.id === "oxidized").assertion = "Water gives up electrons.";
  assert.ok(reviewExtraction(f.importedSource, f.draft).some(r => r.warning.message.includes("paraphrase")));
});

test("a lost known scope gets a warning without rewriting assertion or evidence", () => {
  const f = fixture(true), s = f.draft.statements.find(s => s.id === "actor-bacteria");
  s.assertion = "Bacteria carry out photosynthesis."; s.conditions = [];
  const analysis = normalizeAnalysisDraft(f.importedSource, f.draft);
  assert.ok(analysis.analysisWarnings.some(w => w.message.includes("source scope phrase")));
  assert.ok(analysis.graph.statements.some(s => s.assertion === "Bacteria carry out photosynthesis."));
});

test("similar concept names do not create false missing-participant findings", () => {
  const f = fixture(true); f.draft.concepts.push({ id: "generic-energy", name: "Energy", aliases: [] });
  f.draft.statements.find(s => s.id === "capture").assertion = "Plants, algae, and some types of bacteria use sunlight to produce oxygen and chemical energy stored in glucose.";
  assert.ok(!reviewExtraction(f.importedSource, f.draft).some(r => r.draftStatementId === "capture" && r.warning.message.includes("absent")));
});

function one(text, concepts, representation, assertion = text, conditions = [], negated = false) {
  const importedSource = importText(text), quote = importedSource.document.blocks[0].text;
  return { importedSource, draft: { topics: [{ id: "t", title: "Synthetic" }], concepts,
    blockDispositions: [{ blockId: importedSource.document.blocks[0].id, kind: "knowledge" }],
    statements: [{ id: "s", topicId: "t", representation, assertion, negated, conditions, role: "fact", evidence: [{ blockId: importedSource.document.blocks[0].id, quote }] }],
    lessonSections: [{ topicId: "t", summary: assertion, statementIds: ["s"], keyPoints: [{ text: assertion, statementIds: ["s"] }] }] } };
}
for (const [label, text, assertion, relation, conditions, negated] of [
  ["negation", "Sensor does not transmit signals.", "Sensor does not transmit signals.", "transmit", [], true],
  ["some", "Some sensors transmit signals.", "Some sensors transmit signals.", "transmit", ["Some sensors"], false],
  ["only", "Only sensors transmit signals.", "Only sensors transmit signals.", "transmit", ["Only sensors"], false],
  ["condition", "Sensor transmits signals if enabled.", "Sensor transmits signals if enabled.", "transmits", ["If enabled"], false],
]) test(`synthetic non-biology: ${label} survives pipeline and graph`, () => {
  const f = one(text, [{ id: "x", name: "Sensor", aliases: ["sensors"] }, { id: "y", name: "Signals", aliases: [] }], { kind: "binary", subjectConceptId: "x", relation, objectConceptId: "y" }, assertion, conditions, negated);
  const result = normalizeAnalysisDraft(f.importedSource, parseDraft(JSON.stringify(f.draft)));
  assert.equal(result.graph.statements[0].negated, negated); assert.deepEqual(result.graph.statements[0].conditions, conditions);
  const edge = toReferenceFlow(result.graph, result.graph.topics[0].id).edges[0];
  if (conditions.length) assert.ok(edge.label.includes(conditions[0]));
  if (negated) assert.ok(edge.label.startsWith("not "));
});

test("inverse predicates, multiple participants, distinct energies and valid reflexive claims stay supported", () => {
  const inverse = one("The procedure is carried out by workers.", [{ id: "p", name: "Procedure", aliases: [] }, { id: "w", name: "Workers", aliases: [] }], { kind: "binary", subjectConceptId: "p", relation: "is carried out by", objectConceptId: "w" });
  assert.equal(normalizeAnalysisDraft(inverse.importedSource, inverse.draft).graph.statements[0].representation.kind, "binary");
  const complex = one("Light energy is converted into chemical energy by the device.", [{ id: "l", name: "Light energy", aliases: [] }, { id: "c", name: "Chemical energy", aliases: [] }, { id: "d", name: "Device", aliases: [] }], { kind: "complex", participants: [{ conceptId: "l", role: "input" }, { conceptId: "c", role: "output" }, { conceptId: "d", role: "agent" }] });
  const r = normalizeAnalysisDraft(complex.importedSource, complex.draft); assert.equal(r.graph.concepts.length, 3); assert.equal(toReferenceFlow(r.graph, r.graph.topics[0].id).edges.length, 3);
  const reflexive = one("System regulates itself.", [{ id: "x", name: "System", aliases: [] }], { kind: "binary", subjectConceptId: "x", relation: "regulates", objectConceptId: "x" });
  const loop = normalizeAnalysisDraft(reflexive.importedSource, reflexive.draft).graph.statements[0];
  assert.equal(loop.representation.subjectConceptId, loop.representation.objectConceptId);
  assert.ok(!inspectStatement(reflexive.draft.statements[0], reflexive.draft.concepts, "$s").some(i => i.severity === "error"));
});

function repairFixture() {
  const f = fixture(false), bad = structuredClone(f.draft);
  bad.statements.find(s => s.id === "storage").representation.objectConceptId = "process";
  let issues; try { normalizeAnalysisDraft(f.importedSource, bad); } catch (e) { issues = e.issues; }
  assert.ok(issues);
  const plan = planStatementRepair(bad, issues, f), patch = { concepts: [], statements: [f.draft.statements.find(s => s.id === "storage")], lessonSections: f.draft.lessonSections.filter(s => plan.topicIds.includes(s.topicId)) };
  return { f, bad, plan, patch };
}
test("local repair keeps good claims and IDs, sends only failed claims/related blocks and revalidates the whole graph", async () => {
  const { f, bad, plan, patch } = repairFixture(), prompt = JSON.parse(statementRepairPrompt(f, plan));
  assert.deepEqual(prompt.repair.statements.map(s => s.id), ["storage"]); assert.equal(prompt.sourceData.blocks.length, 1); assert.equal(prompt.repair.previousDraft, undefined);
  const merged = mergeStatementRepair(JSON.stringify(patch), plan);
  assert.deepEqual(merged.statements.filter(s => s.id !== "storage"), bad.statements.filter(s => s.id !== "storage"));
  assert.deepEqual(merged.topics, bad.topics); assert.deepEqual(merged.blockDispositions, bad.blockDispositions);
  let calls = 0; const captures = [];
  const analysis = await analyzeImportedSource({ schemaVersion: "2.0", importedSource: f.importedSource }, { async generate(request) { calls++; if (calls === 2) assert.ok(!request.schema.properties.blockDispositions); return { text: JSON.stringify(calls === 1 ? bad : patch), finishReason: "stop" }; } }, { retryDelayMs: 0, capture: c => captures.push(c) });
  assert.equal(calls, 2); assert.equal(validateSourceAnalysis(analysis).valid, true); assert.deepEqual(captures[1].draft, merged);
});
for (const [name, mutate] of [
  ["dropped hard claim", p => p.statements = []],
  ["valid claim overwrite", p => p.statements[0].id = "actor-bacteria"],
  ["topic move", p => p.statements[0].topicId = "conversion"],
  ["existing concept rewrite", p => p.concepts = [{ id: "glucose", name: "Photosynthesis", aliases: [] }]],
  ["unrelated source block", p => p.statements[0].evidence[0].blockId = "unrelated-block"],
  ["lost lesson link", p => p.lessonSections[0].statementIds.pop()],
]) test(`local repair rejects ${name}`, () => { const { plan, patch } = repairFixture(); mutate(patch); assert.throws(() => mergeStatementRepair(JSON.stringify(patch), plan), e => e.code === "AI_OUTPUT_INVALID"); });
test("a repaired fabricated quote or unknown participant still fails full backend validation", () => {
  for (const change of [p => p.statements[0].evidence[0].quote = "Not in source", p => p.statements[0].representation.objectConceptId = "unknown"]) {
    const { f, plan, patch } = repairFixture(); change(patch);
    assert.throws(() => normalizeAnalysisDraft(f.importedSource, mergeStatementRepair(JSON.stringify(patch), plan)), e => e.code === "AI_OUTPUT_INVALID");
  }
});

test("global structural issues and duplicate statement identities do not use a local patch", () => {
  const { f, bad } = repairFixture();
  assert.equal(planStatementRepair(bad, [{ path: "$.topics", code: "invariant", message: "Global issue" }], f), undefined);
  bad.statements.push(structuredClone(bad.statements[0]));
  assert.equal(planStatementRepair(bad, [{ path: "$.statements[0].assertion", code: "invariant", message: "Duplicate identity" }], f), undefined);
});

test("original real v2 capture confirms errors start in extraction, not normalization", t => {
  const file = "test-results/graph-v2/generation-3.json";
  if (!existsSync(file)) return t.skip("Original local capture absent.");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  const draft = JSON.parse(saved.candidates[0].content.parts.filter(p => !p.thought).map(p => p.text ?? "").join(""));
  assert.equal(draft.statements.filter(s => s.assertion === "The process is carried out by plants, algae, and some types of bacteria").length, 3);
  const source = JSON.parse(readFileSync("test-results/graph-v2/analysis-live-2.json", "utf8")).request.importedSource;
  const reviews = reviewExtraction(source, draft);
  assert.ok(reviews.some(r => r.warning.message.includes("meaning")));
  assert.ok(draft.statements.some(s => s.id === "st-10" && !s.representation.participants.some(p => ["air", "soil"].includes(p.conceptId))));
  mkdirSync("test-results/extraction-quality-v2", { recursive: true });
  writeFileSync("test-results/extraction-quality-v2/before-review.json", JSON.stringify({ provenance: "Review of unchanged saved real v2 draft; no new call", reviews }, null, 2));
});
