/** Deliberately faulty synthetic AI outputs exercise the default display path. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { migrateLegacyDraft } from "./legacy-artifact.mjs";
const require = createRequire(import.meta.url), load = p => require(`../../test-results/analysis-build/${p}.js`);
const { importText } = load("backend/sources/ingest");
const { handleAnalysisRequest } = load("backend/analysis/handler");
const { handleEvaluationRequest, normalizeEvaluation } = load("backend/explanations/evaluation");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { readOutputObject, readableAnalysisDraft } = load("backend/analysis/output-normalization");
const { namespacePart, mergePartDrafts, validateSectionRequest, analyzeNextPart } = load("backend/analysis/section-pipeline");
const { validateDisplayImportedAnalysisResponse, validateDisplayEvaluateTextResponse, validateSourceAnalysis } = load("backend/contracts/validate");
const { toLessonFlow, toExplanationFlow, toComparisonFlow, ALL_TOPICS } = load("lib/comparison-graph");
const { layoutReferenceGraph } = load("lib/graph-layout");
const { AnalysisError } = load("backend/analysis/errors");

const importedSource = importText("Plants produce glucose.\n\nGlucose stores chemical energy.\n\nChlorophyll absorbs light energy.", "Synthetic mixed-error Lesson");
const initial = {
  topics: [{ id: "a", title: "Growth" }, { id: "b", title: "Energy" }],
  concepts: [{ id: "plant", name: "Plants", aliases: [] }, { id: "glucose", name: "Glucose", aliases: [] }, { id: "energy", name: "Chemical energy", aliases: [] }, { id: "chlorophyll", name: "Chlorophyll", aliases: [] }],
  blockDispositions: [], // Coverage is deliberately incomplete.
  statements: [
    { id: "growth", topicId: "a", assertion: "Plants produce glucose.", negated: false, conditions: [], role: "fact", representation: { kind: "binary", subjectConceptId: "plant", relation: "produce", objectConceptId: "glucose" }, evidence: [{ blockId: importedSource.document.blocks[0].id, quote: "Plants produce glucose." }] },
    { id: "storage", topicId: "b", assertion: "Glucose stores chemical energy.", negated: true, formula: "E = mc^2", conditions: ["AI condition kept verbatim"], role: "fact", representation: { kind: "binary", subjectConceptId: "glucose", relation: "stores", objectConceptId: "plant" }, evidence: [{ blockId: importedSource.document.blocks[1].id, quote: "AI quote absent from the source", charRange: { start: 0, end: 5 } }] },
    { id: "storage", topicId: "b", assertion: "Chlorophyll absorbs light energy.", negated: false, conditions: [], role: "fact", representation: { kind: "binary", subjectConceptId: "chlorophyll", relation: "absorbs", objectConceptId: "unknown" }, evidence: [{ blockId: "unknown-block", quote: "Original AI quote with no known block" }] },
    { topicId: "a", assertion: "A complete AI assertion without usable participants.", negated: false, representation: { kind: "complex", participants: [null, "bad", { conceptId: "plant", role: "agent" }, { conceptId: "unknown", role: "output" }, { conceptId: "glucose", role: 9 }] } },
    { id: "orphan", topicId: "b", assertion: "AI assertion retained as a standalone card.", representation: { kind: "complex", participants: { invalid: true } } },
  ],
  lessonSections: [{ topicId: "a", summary: "AI summary kept verbatim.", statementIds: ["growth", "unknown"], keyPoints: [] }],
};
const analysis = normalizeAnalysisDraft(importedSource, initial);
const learnerText = "Plants produce glucose. Glucose stores chemical energy. Chlorophyll absorbs light energy. Some plants have medicinal uses.";
const input = { schemaVersion: "2.0", importedSource, sourceAnalysis: analysis, topicIds: analysis.graph.topics.map(t => t.id), learner: { text: learnerText } };
const evaluationDraft = {
  concepts: [{ id: "p", name: "Plants", aliases: [] }, { id: "g", name: "Glucose", aliases: [] }, { id: "p", name: "Different AI concept with duplicate ID", aliases: [] }, { name: "Concept without ID", aliases: [] }],
  claims: [
    { id: "c1", assertion: "Plants produce glucose.", negated: false, conditions: [], quote: "Plants produce glucose.", representation: { kind: "binary", subjectConceptId: "p", relation: "produce", objectConceptId: "g" } },
    { id: "c2", assertion: "Glucose stores chemical energy.", negated: true, conditions: [], quote: "AI quote not in learner input", representation: { kind: "binary", subjectConceptId: "g", relation: "stores", objectConceptId: "missing" } },
    { id: "c2", assertion: "Chlorophyll absorbs light energy.", negated: false, conditions: [], quote: "Chlorophyll absorbs light energy.", representation: { kind: "complex", participants: [null, { conceptId: "p", role: "context" }, { conceptId: "g", role: 7 }] } },
    { assertion: "Some plants have medicinal uses.", quote: "Some plants have medicinal uses.", representation: { kind: "complex", participants: [] } },
  ],
  comparisons: [
    { referenceRelationshipId: analysis.graph.statements[0].id, status: "correct", learnerClaimIds: ["c1"], explanation: "AI verdict is preserved.", suggestions: [] },
    { referenceRelationshipId: analysis.graph.statements[0].id, status: "contradicted", learnerClaimIds: ["c2"], explanation: "Duplicate reference", suggestions: [] },
    { referenceRelationshipId: analysis.graph.statements[1].id, status: "partial", learnerClaimIds: ["c2"], explanation: "AI verdict with unverified evidence is preserved.", suggestions: [] },
    { referenceRelationshipId: "missing-reference", status: "correct", learnerClaimIds: ["c2"], explanation: "Unknown reference", suggestions: [] },
    { referenceRelationshipId: analysis.graph.statements[2].id, status: "correct", learnerClaimIds: ["missing-claim"], explanation: "Unknown claim", suggestions: [] },
  ],
  additionalIdeas: [{ learnerClaimIds: ["c1", "unknown"], explanation: "Conflicting additional membership" }],
  conceptAlignments: [
    { learnerConceptId: "p", referenceConceptId: analysis.graph.concepts[0].id, status: "matched", explanation: "Supported comparison" },
    { learnerConceptId: "g", referenceConceptId: analysis.graph.concepts[3].id, status: "matched", explanation: "Unsupported comparison" },
    { learnerConceptId: "unknown", referenceConceptId: analysis.graph.concepts[0].id, status: "matched", explanation: "Unknown learner concept" },
    { learnerConceptId: "g", referenceConceptId: "unknown", status: "matched", explanation: "Unknown source concept" },
  ],
};
const evaluation = normalizeEvaluation(input, JSON.stringify(evaluationDraft));
const directory = ".explainback-artifacts/nonblocking-output";
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/fixture.json`, JSON.stringify({ importedSource, analysis, input, initial, evaluationDraft, evaluation, provenance: "Synthetic mixed-error replay; no live AI." }));
const cases = ["unclassified_learner_claim", "claim_classification_conflict", "unsupported_unknown_alignment", "literal_object_polarity_mismatch", "complex_participants_shape", "missing_endpoints_duplicate_ids_evidence", "combined"];
const browserCases = cases.map(name => {
  const sourceDraft = structuredClone(initial);
  sourceDraft.statements = sourceDraft.statements.slice(0, 3);
  sourceDraft.statements[1].negated = false;
  sourceDraft.statements[1].representation.objectConceptId = "energy";
  sourceDraft.statements[1].evidence = [{ blockId: importedSource.document.blocks[1].id, quote: importedSource.document.blocks[1].text }];
  sourceDraft.statements[2].id = "light";
  sourceDraft.statements[2].representation = { kind: "complex", participants: [{ conceptId: "chlorophyll", role: "agent" }] };
  sourceDraft.statements[2].evidence = [{ blockId: importedSource.document.blocks[2].id, quote: importedSource.document.blocks[2].text }];
  if (name === "literal_object_polarity_mismatch") { sourceDraft.statements[1].negated = true; sourceDraft.statements[1].representation.objectConceptId = "plant"; }
  if (name === "complex_participants_shape") sourceDraft.statements[2].representation.participants = [null, "bad", { conceptId: "glucose", role: 42 }];
  if (name === "missing_endpoints_duplicate_ids_evidence") {
    sourceDraft.statements[2].id = "storage";
    sourceDraft.statements[2].representation = { kind: "binary", subjectConceptId: "chlorophyll", objectConceptId: "absent", relation: "absorbs" };
    sourceDraft.statements[2].evidence = [{ blockId: "unknown-block", quote: "AI quote not in source" }];
    sourceDraft.concepts.push({ id: "glucose", name: "Different concept", aliases: [] });
    delete sourceDraft.statements[0].id;
  }
  if (name === "combined") Object.assign(sourceDraft, structuredClone(initial));
  const sourceAnalysis = normalizeAnalysisDraft(importedSource, sourceDraft);
  const evalDraft = structuredClone(evaluationDraft);
  if (name !== "combined") {
    evalDraft.concepts = [...evalDraft.concepts.slice(0, 2), { id: "e", name: "Chemical energy", aliases: [] }];
    evalDraft.claims = evalDraft.claims.slice(0, 2);
    evalDraft.claims[1].negated = false; evalDraft.claims[1].quote = "Glucose stores chemical energy.";
    evalDraft.claims[1].representation = { kind: "binary", subjectConceptId: "g", relation: "stores", objectConceptId: "e" };
    evalDraft.comparisons = [evalDraft.comparisons[0], evalDraft.comparisons[2]];
    evalDraft.comparisons.forEach((c, i) => c.referenceRelationshipId = sourceAnalysis.graph.statements[i].id);
    evalDraft.additionalIdeas = []; evalDraft.conceptAlignments = [evalDraft.conceptAlignments[0]];
    if (name === "unclassified_learner_claim") evalDraft.claims.push(structuredClone(evaluationDraft.claims[3]));
    if (name === "claim_classification_conflict") evalDraft.additionalIdeas = [{ learnerClaimIds: ["c1"], explanation: "Duplicate membership" }];
    if (name === "unsupported_unknown_alignment") evalDraft.conceptAlignments.push(...structuredClone(evaluationDraft.conceptAlignments.slice(1)));
    if (name === "literal_object_polarity_mismatch") { evalDraft.claims[1].negated = true; evalDraft.claims[1].representation.objectConceptId = "p"; }
    if (name === "complex_participants_shape") evalDraft.claims[1].representation = { kind: "complex", participants: { invalid: true } };
    if (name === "missing_endpoints_duplicate_ids_evidence") {
      evalDraft.claims[1].id = "c1"; evalDraft.claims[1].representation.objectConceptId = "missing";
      evalDraft.claims[1].quote = "AI quote missing from learner input";
      evalDraft.concepts.push({ id: "p", name: "Another concept", aliases: [] });
    }
  }
  return { name, importedSource, sourceDraft, evaluationDraft: evalDraft, learnerText };
});
writeFileSync(`${directory}/browser-cases.json`, JSON.stringify(browserCases));
const request = (path, value) => new Request(`http://local/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
const provider = value => { const calls = []; return { calls, generate: async r => { calls.push(r); return { text: JSON.stringify(value), finishReason: "stop" }; } }; };

test("mixed source quality/coverage/polarity/endpoint/evidence/shape errors return graph without repair", async () => {
  const before = structuredClone(initial), p = provider(initial), response = await handleAnalysisRequest(request("analysis", { schemaVersion: "2.0", importedSource }), () => p);
  assert.equal(response.status, 200); assert.equal(p.calls.length, 1);
  const body = await response.json(); assert.equal(validateDisplayImportedAnalysisResponse({ schemaVersion: "2.0", importedSource }, body).valid, true);
  assert.equal(validateSourceAnalysis(body.data).valid, false, "Historical quality diagnostic still detects inconsistent output; it is not a display gate.");
  assert.equal(body.data.graph.statements.length, initial.statements.length);
  assert.deepEqual(body.data.graph.statements.map(s => s.assertion), initial.statements.map(s => s.assertion));
  assert.equal(new Set(body.data.graph.statements.map(s => s.id)).size, initial.statements.length);
  assert.deepEqual(body.data, analysis); assert.deepEqual(initial, before);
  assert.equal(body.data.graph.statements[1].negated, true); assert.equal(body.data.graph.statements[1].formula, "E = mc^2");
  assert.deepEqual(body.data.analysisWarnings, []);
  assert.equal(body.data.graph.evidence[1].verification, "unverified"); assert.equal(body.data.graph.evidence[1].location, undefined);
  assert.equal(body.data.graph.statements[2].representation.kind, "complex");
  assert.equal(body.data.graph.statements[3].representation.participants.length, 1);
  assert.equal(body.data.graph.statements[4].representation.participants.length, 0);
});
test("evaluation classification/reference failures keep all claims, usable verdicts, and only supported mappings", async () => {
  const before = structuredClone(evaluationDraft), p = provider(evaluationDraft), response = await handleEvaluationRequest(request("evaluations", input), p);
  assert.equal(response.status, 200); assert.equal(p.calls.length, 1);
  const body = await response.json(); assert.equal(validateDisplayEvaluateTextResponse(input, body).valid, true);
  assert.deepEqual(body.data, evaluation); assert.deepEqual(evaluationDraft, before);
  assert.equal(evaluation.learnerGraph.statements.length, 4);
  assert.equal(evaluation.comparisons.length, 2); assert.deepEqual(evaluation.comparisons.map(c => c.status), ["correct", "partial"]);
  assert.equal(evaluation.additionalIdeas.length, 0); assert.equal(evaluation.conceptAlignments.length, 1);
  assert.equal(evaluation.learnerGraph.evidence[1].quote, "AI quote not in learner input"); assert.equal(evaluation.learnerGraph.evidence[1].location, undefined);
  assert.equal(evaluation.learnerGraph.statements[1].negated, true);
  const flow = toComparisonFlow(analysis.graph, evaluation, ALL_TOPICS);
  for (const s of evaluation.learnerGraph.statements) assert.ok(flow.details.some(d => d.learner.some(c => c.id === s.id)));
  assert.equal(flow.details.filter(d => d.learner.length && !d.comparison).length, 2);
  const unmatched = evaluation.learnerGraph.concepts.find(c => c.name === "Glucose");
  assert.ok(flow.nodes.some(n => n.id === `${evaluation.learnerGraph.id}:${unmatched.id}`));
  assert.ok(flow.nodes.some(n => n.id === `${analysis.graph.id}:${analysis.graph.concepts[1].id}`));
});
test("partial JSON preserves readable complete claims without completing text or inventing evidence", () => {
  const raw = '{"concepts":[{"id":"p","name":"Plants","aliases":[]}],"claims":[{"id":"c","assertion":"Complete AI claim","quote":"Actual quote","representation":{"kind":"complex","participants":[]}},{"id":"tail","assertion":"unfin';
  const result = normalizeEvaluation(input, raw);
  assert.equal(result.learnerGraph.statements.length, 1, "An ID-only truncated record is not a readable claim.");
  assert.equal(result.learnerGraph.statements[0].assertion, "Complete AI claim");
  assert.ok(result.learnerGraph.statements.every(s => !s.assertion.includes("unfin")));
  assert.throws(() => readOutputObject("No JSON returned"));
  assert.throws(() => readOutputObject("{}"));
  assert.throws(() => readOutputObject('{"message":"OK"}'));
});
test("source catalog IDs resolve records, namespace/cards/merge preserve completed topics", () => {
  const catalog = [{ id: "existing", name: "Known concept", aliases: [] }];
  const raw = { topics: [{ id: "section-2", title: "Next topic" }], concepts: [], statements: [{ id: "new", topicId: "section-2", assertion: "AI claim", representation: { kind: "binary", subjectConceptId: "existing", objectConceptId: "unknown", relation: "relates" } }] };
  const draft = readableAnalysisDraft(raw, catalog);
  assert.deepEqual(draft.concepts[0], catalog[0]); assert.equal(draft.statements[0].representation.participants[0].conceptId, "existing");
  const part = { id: "part-2", topicId: "section-2", title: "Next topic", blockIds: [], topics: [{ id: "section-2", title: "Next topic", blockIds: [] }] };
  const namespaced = namespacePart(draft, part, catalog);
  const first = readableAnalysisDraft({ topics: [{ id: "section-1", title: "Completed topic" }], concepts: catalog });
  const merged = mergePartDrafts([{ draft: first }, { draft: namespaced }]);
  assert.deepEqual(merged.topics.map(t => t.title), ["Completed topic", "Next topic"]);
  assert.equal(merged.statements.length, 1); assert.equal(merged.concepts.filter(c => c.id === "existing").length, 1);
});
test("section checkpoints preserve all completed data even when a later part returns malformed claims", async () => {
  const source = importText(`Topic one\n\n${"Plants produce glucose. ".repeat(105)}\n\nTopic two\n\n${"Glucose stores energy. ".repeat(105)}`);
  const base = { schemaVersion: "2.0", importedSource: source };
  let state = validateSectionRequest({ ...base, processing: { completedParts: [], callsUsed: 0 } }), completedParts = [], callsUsed = 0;
  const topics = state.plan.flatMap(p => p.topics.map(t => t.id));
  for (const part of state.plan) {
    const raw = { topics: part.topics.map(t => ({ id: t.id, title: t.title })), concepts: [], statements: [{ id: "claim", topicId: part.topicId, assertion: `Readable AI claim for ${part.title}`, representation: { kind: "complex", participants: { invalid: true } } }] };
    const result = await analyzeNextPart(state, provider(raw)); callsUsed = result.callsUsed;
    if (result.data.kind === "part_complete") { completedParts.push(result.data.part); state = validateSectionRequest({ ...base, processing: { completedParts, callsUsed } }); }
    else { assert.equal(result.data.graph.statements.length, state.plan.length); assert.ok(topics.every(id => result.data.graph.topics.some(t => t.title === state.plan.flatMap(p => p.topics).find(t => t.id === id).title))); }
  }
  assert.equal(callsUsed, state.plan.length);
});
test("bad output is not retried, while input/quota/timeout/outage errors remain errors", async () => {
  for (const [code, status] of [["AI_RATE_LIMITED", 429], ["AI_TIMEOUT", 504], ["UPSTREAM_UNAVAILABLE", 503], ["AI_NOT_CONFIGURED", 503]]) {
    let calls = 0; const p = { generate: async () => { calls++; throw new AnalysisError(code, status, "Synthetic service failure"); } };
    const response = await handleEvaluationRequest(request("evaluations", input), p); assert.equal(response.status, status); assert.equal(calls, 1);
  }
  const response = await handleEvaluationRequest(request("evaluations", { ...input, learner: { text: "" } }), provider(evaluationDraft));
  assert.equal(response.status, 400);
  let calls = 0; const p = { generate: async () => { calls++; return { text: "", finishReason: "stop" }; } };
  const empty = await handleAnalysisRequest(request("analysis", { schemaVersion: "2.0", importedSource }), () => p);
  assert.equal(empty.status, 502); assert.equal(calls, 1);
});
test("all three adapters and ELK render complex cards without links and incomplete evidence", async () => {
  for (const flow of [toLessonFlow(analysis.graph, ALL_TOPICS), toExplanationFlow(evaluation, ALL_TOPICS), toComparisonFlow(analysis.graph, evaluation, ALL_TOPICS)]) {
    assert.ok(flow.nodes.length); assert.ok(flow.details.length);
    assert.equal(new Set(flow.nodes.map(n => n.id)).size, flow.nodes.length);
    const laidOut = await layoutReferenceGraph(flow.nodes, flow.edges, new Map());
    assert.ok(laidOut.nodes.every(n => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)));
  }
  const onlyConcepts = normalizeAnalysisDraft(importedSource, { concepts: initial.concepts });
  const isolated = toLessonFlow(onlyConcepts.graph, ALL_TOPICS);
  assert.equal(isolated.nodes.length, initial.concepts.length); assert.deepEqual(isolated.edges, []);
  assert.deepEqual(isolated.details, []);
  assert.deepEqual(toLessonFlow(analysis.graph, "no-statements-in-this-topic").nodes, []);
});
test("existing capture candidate retains learner content through the new display response contract", () => {
  const path = ".explainback-artifacts/evaluations/synthetic-sanitization-call-1.json";
  if (!existsSync(path)) return;
  const capture = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(validateDisplayEvaluateTextResponse(capture.input, { ok: true, schemaVersion: "2.0", data: capture.candidate }).valid, true);
});

test("historical real extraction captures render after shape-only v1 migration, without correcting their meaning", async () => {
  const source = importText(readFileSync("tests/analysis/fixtures/multisection-source.txt", "utf8"));
  for (const name of ["multisection-failed-draft.json", "multisection-final-failed-draft.json"]) {
    const raw = JSON.parse(readFileSync(`tests/analysis/fixtures/${name}`, "utf8")), migrated = migrateLegacyDraft(raw);
    // The historical capture used positional block aliases; translate only those
    // IDs to the corresponding unchanged ingestion blocks for offline replay.
    const block = id => source.document.blocks[Number(id.replace("block-", ""))].id;
    migrated.blockDispositions.forEach(b => b.blockId = block(b.blockId));
    migrated.statements.forEach(s => s.evidence.forEach(e => e.blockId = block(e.blockId)));
    const p = provider(migrated), response = await handleAnalysisRequest(request("analysis", { schemaVersion: "2.0", importedSource: source }), () => p);
    const body = await response.json(); assert.equal(response.status, 200); assert.equal(p.calls.length, 1);
    assert.equal(validateDisplayImportedAnalysisResponse({ schemaVersion: "2.0", importedSource: source }, body).valid, true);
    assert.deepEqual(body.data.graph.statements.map(s => [s.assertion, s.negated, s.formula]), raw.statements.map(s => [s.assertion, s.negated, s.formula]));
    assert.deepEqual(body.data.graph.evidence.map(e => e.quote), raw.statements.flatMap(s => s.evidence.map(e => e.quote)));
    assert.deepEqual(body.data.analysisWarnings, []);
    const flow = toLessonFlow(body.data.graph, ALL_TOPICS); assert.equal(flow.details.length, raw.statements.length);
  }
});
