/** V3 audit: boundary reproduction and synthetic semantic contract checks. No AI. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { sourceText, explanations, syntheticDraft, rows } from "./v3-fixtures.mjs";
const require = createRequire(import.meta.url);
const load = file => require(`../../test-results/analysis-build/${file}.js`);
const { importText, importFile } = load("backend/sources/ingest");
const { handleSourceRequest } = load("backend/sources/handler");
const { validateAnalysisInput } = load("backend/analysis/pipeline");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { handleAnalysisRequest } = load("backend/analysis/handler");
const { handleEvaluationRequest, validateEvaluationInput, normalizeEvaluation, EVALUATION_DRAFT_SCHEMA } = load("backend/explanations/evaluation");
const { inspectAudio } = load("backend/explanations/audio");
const { toReferenceFlow } = load("lib/reference-graph");
const { parseDraft, matches } = load("backend/analysis/draft");
const records = [];
const source = importText(sourceText);
const analysis = normalizeAnalysisDraft(source, syntheticDraft(source));
const topicId = analysis.graph.topics[0].id;
const input = text => ({ schemaVersion: "1.0", importedSource: source, sourceAnalysis: analysis, topicIds: [topicId], learner: { text } });
const jsonRequest = (path, body) => new Request(`http://audit/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });
const missing = () => ({ claims: [], comparisons: analysis.graph.statements.map(s => ({ referenceRelationshipId: s.id, status: "missing", learnerClaimIds: [], explanation: "Not expressed in this explanation; no inference about understanding.", suggestions: [] })), additionalIdeas: [] });
const mock = value => ({ calls: 0, async generate() { this.calls++; return { text: JSON.stringify(value), finishReason: "stop" }; } });
function record(name, value) { records.push({ name, ...value }); }
function check(name, work, expected) {
  let error;
  try { work(); } catch (e) { error = e; }
  record(name, { accepted: !error, code: error?.code, message: error?.message });
  assert.equal(error?.code, expected);
}

for (const offset of [-1, 0, 1]) {
  test(`text ingestion boundary ${100000 + offset}`, () => check(`text:${100000 + offset}`, () => importText("x".repeat(100000 + offset)), offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined));
  test(`analysis character boundary ${20000 + offset}`, async () => {
    const importedSource = importText("x".repeat(20000 + offset));
    check(`analysis-chars:${20000 + offset}`, () => validateAnalysisInput({ schemaVersion: "1.0", importedSource }), offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined);
    if (offset > 0) {
      let calls = 0;
      const r = await handleAnalysisRequest(jsonRequest("analysis", JSON.stringify({ schemaVersion: "1.0", importedSource })), () => { calls++; throw new Error("must not create provider"); });
      assert.equal(r.status, 413); assert.equal(calls, 0);
    }
  });
  test(`analysis block boundary ${120 + offset}`, () => check(`analysis-blocks:${120 + offset}`, () => validateAnalysisInput({ schemaVersion: "1.0", importedSource: importText(Array(120 + offset).fill("Fact.").join("\n\n")) }), offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined));
  test(`learner character boundary ${10000 + offset}`, () => check(`learner:${10000 + offset}`, () => validateEvaluationInput(input("x".repeat(10000 + offset))), offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined));
  test(`title boundary ${200 + offset}`, () => check(`title:${200 + offset}`, () => importText("Fact.", "x".repeat(200 + offset)), offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined));
}
for (const extension of ["pdf", "docx"]) {
  for (const limit of [20000, 100000]) for (const offset of [-1, 0, 1]) {
    const length = limit + offset;
    test(`${extension} extracted character boundary ${length}`, async () => {
      const bytes = readFileSync(`test-results/v3-audit/fixtures/chars-${length}.${extension}`);
      let imported, error;
      try { imported = await importFile(bytes); } catch (e) { error = e; }
      record(`${extension}-chars:${length}`, { bytes: bytes.length, accepted: !error, originalCharacters: imported?.metadata.originalCharacterCount, normalizedCharacters: imported?.normalizedText.length, code: error?.code });
      assert.equal(error?.code, limit === 100000 && offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined);
      if (imported) {
        assert.equal(imported.metadata.originalCharacterCount, length);
        check(`${extension}-analysis:${length}`, () => validateAnalysisInput({ schemaVersion: "1.0", importedSource: imported }), length > 20000 ? "PAYLOAD_TOO_LARGE" : undefined);
      }
    });
  }
  for (const offset of [-1, 0, 1]) test(`${extension} file byte boundary ${3000000 + offset}`, async () => {
    const bytes = readFileSync(`test-results/v3-audit/fixtures/bytes-${3000000 + offset}.${extension}`);
    assert.equal(bytes.length, 3000000 + offset);
    let error; try { await importFile(bytes); } catch (e) { error = e; }
    record(`${extension}-bytes:${bytes.length}`, { accepted: !error, code: error?.code });
    assert.equal(error?.code, offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined);
  });
}
for (const pages of [29, 30, 31]) test(`PDF page boundary ${pages}`, async () => {
  let error; try { await importFile(readFileSync(`test-results/v3-audit/fixtures/pages-${pages}.pdf`)); } catch (e) { error = e; }
  record(`pdf-pages:${pages}`, { accepted: !error, code: error?.code });
  assert.equal(error?.code, pages > 30 ? "PAYLOAD_TOO_LARGE" : undefined);
});
for (const [kind, limit] of [["entries", 1000], ["entry-bytes", 5000000], ["expanded-bytes", 10000000]]) for (const offset of [-1, 0, 1]) test(`DOCX archive ${kind} boundary ${limit + offset}`, async () => {
  const bytes = readFileSync(`test-results/v3-audit/fixtures/${kind}-${limit + offset}.docx`);
  let error; try { await importFile(bytes); } catch (e) { error = e; }
  record(`docx-${kind}:${limit + offset}`, { compressedBytes: bytes.length, accepted: !error, code: error?.code });
  assert.equal(error?.code, offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined);
});
test("analysis counts original whitespace even when normalized text is short", () => {
  const importedSource = importText("Fact." + " ".repeat(20000 - 4));
  assert.equal(importedSource.normalizedText, "Fact.");
  check("analysis-original-whitespace", () => validateAnalysisInput({ schemaVersion: "1.0", importedSource }), "PAYLOAD_TOO_LARGE");
});
test("ingestion splits, rather than discards, a paragraph across the 2000-unit boundary", () => {
  for (const length of [1999, 2000, 2001]) {
    const text = "x".repeat(length), imported = importText(text);
    assert.ok(imported.document.blocks.every(b => b.text.length <= 2000));
    assert.equal(imported.document.blocks.map(b => b.text).join(""), text);
    record(`block-characters:${length}`, { blocks: imported.document.blocks.length, preserved: true });
  }
});
for (const path of ["sources", "analysis", "evaluations"]) for (const offset of [-1, 0, 1]) test(`${path} streamed body bytes boundary ${offset}`, async () => {
  const limit = path === "sources" ? 3065536 : 1000000;
  const body = JSON.stringify(path === "sources" ? { schemaVersion: "1.0", source: { kind: "text", text: sourceText } } : path === "analysis" ? { schemaVersion: "1.0", importedSource: source } : input(explanations.short));
  const padded = body + " ".repeat(limit + offset - Buffer.byteLength(body));
  const p = mock(path === "analysis" ? syntheticDraft(source) : missing());
  const request = jsonRequest(path, padded);
  const response = path === "sources" ? await handleSourceRequest(request) : path === "analysis" ? await handleAnalysisRequest(request, () => p) : await handleEvaluationRequest(request, p);
  const result = await response.json();
  record(`${path}-request:${limit + offset}`, { status: response.status, code: result.error?.code, message: result.error?.message, mockCalls: p.calls });
  assert.equal(response.status, offset > 0 ? 413 : 200);
  assert.equal(p.calls, offset > 0 || path === "sources" ? 0 : 1);
});
test("short meaningful and one-character explanations pass the input gate", () => {
  for (const text of ["x", explanations.short]) assert.doesNotThrow(() => validateEvaluationInput(input(text)));
  assert.throws(() => validateEvaluationInput(input("  ")), e => e.code === "INVALID_REQUEST");
});
test("full source+graph request size: normal and contract-valid inflated summary", async () => {
  record("evaluation-benchmark-bytes", { bytes: Buffer.byteLength(JSON.stringify(input(explanations.paraphrase))) });
  const body = structuredClone(input(explanations.short));
  body.sourceAnalysis.lessonSections[0].summary = "x".repeat(1000000);
  assert.doesNotThrow(() => validateEvaluationInput(body));
  const p = mock(missing()); const response = await handleEvaluationRequest(jsonRequest("evaluations", JSON.stringify(body)), p);
  assert.equal(response.status, 413); assert.equal(p.calls, 0);
  record("evaluation-inflated-summary", { bytes: Buffer.byteLength(JSON.stringify(body)), status: response.status, mockCalls: p.calls, note: "Contract-valid stress case, beyond the real provider output-character ceiling; not a demonstrated ordinary-source failure." });
});
const expected = { short: { 7: "correct" }, paraphrase: Object.fromEntries(rows.map((_, i) => [i, "correct"])), missing: { 0: "correct", 3: "correct", 4: "correct" }, contradiction: { 5: "contradicted", 6: "contradicted" }, negation: { 4: "contradicted" }, mixed: { 7: "correct", 1: "contradicted" }, additional: { 7: "correct" }, partial: { 7: "partial" } };
for (const [name, text] of Object.entries(explanations)) test(`synthetic semantic case: ${name}`, () => {
  const d = missing();
  for (const [index, status] of Object.entries(expected[name])) {
    const i = Number(index), id = `claim${i}`;
    const relation = name === "contradiction" ? (i === 5 ? "gains" : "loses") : rows[i][1];
    const object = name === "mixed" && i === 1 ? "Oxygen instead of carbon dioxide" : name === "partial" ? "Energy" : rows[i][2];
    d.claims.push({ id, topicId, subject: rows[i][0], relation, object, assertion: `${rows[i][0]} ${name === "negation" ? "does not " : ""}${relation} ${object}.`, negated: name === "negation", conditions: [], quote: text });
    Object.assign(d.comparisons[i], { status, learnerClaimIds: [id] });
  }
  if (name === "additional") {
    d.claims.push({ id: "extra", topicId, subject: "Some plants", relation: "have", object: "Medicinal uses", assertion: "Some plants also have medicinal uses.", negated: false, conditions: [], quote: "Some plants also have medicinal uses." });
    d.additionalIdeas.push({ topicId, learnerClaimIds: ["extra"], explanation: "Outside this source; no correctness verdict." });
  }
  const result = normalizeEvaluation(input(text), JSON.stringify(d));
  assert.deepEqual(result.comparisons.map(c => c.status), rows.map((_, i) => expected[name][i] ?? "missing"));
  assert.ok(result.comparisons.filter(c => c.status === "missing").every(c => !c.learnerStatements.length));
  for (const evidence of result.learnerGraph.evidence) assert.equal(text.slice(evidence.location.charRange.start, evidence.location.charRange.end), evidence.quote);
  record(`synthetic-semantic:${name}`, { statuses: result.comparisons.map(c => c.status), additionalIdeas: result.additionalIdeas.length, note: "Hand-authored output validates plumbing, not Gemini accuracy." });
});
test("semantic-invalid but quote-verified endpoints survive structural normalization", () => {
  const d = syntheticDraft(source);
  d.statements[7].objectConceptId = d.statements[3].subjectConceptId;
  const wrong = normalizeAnalysisDraft(source, parseDraft(JSON.stringify(d)));
  const s = wrong.graph.statements[7];
  assert.equal(wrong.graph.concepts.find(c => c.id === s.objectConceptId).name, "Photosynthesis");
  assert.equal(s.assertion, "Glucose stores Chemical energy.");
  assert.equal(wrong.graph.evidence.find(e => e.id === s.evidenceIds[0]).verification, "verified");
  record("semantic-validation-gap", { reproduced: true, note: "Synthetic deliberate bad endpoint accepted; not proof that a historical AI response contained it." });
});
test("adapter preserves every endpoint/direction/parallel edge and isolated concept", () => {
  const graph = structuredClone(analysis.graph);
  graph.concepts.push({ id: "isolated", topicId, name: "Isolated synthetic concept", aliases: [] });
  graph.statements.push({ ...graph.statements[0], id: "parallel", relation: "depends on", negated: true });
  graph.statements.push({ ...graph.statements[0], id: "reverse", subjectConceptId: graph.statements[0].objectConceptId, objectConceptId: graph.statements[0].subjectConceptId });
  const copy = structuredClone(graph);
  for (const columns of [1, 2, 3]) {
    const flow = toReferenceFlow(graph, topicId, { columns });
    assert.equal(flow.nodes.length, graph.concepts.length); assert.equal(flow.edges.length, graph.statements.length);
    for (const s of graph.statements) { const edge = flow.edges.find(e => e.id === s.id); assert.equal(edge.source, `${graph.id}:${s.subjectConceptId}`); assert.equal(edge.target, `${graph.id}:${s.objectConceptId}`); assert.equal(edge.label, `${s.negated ? "not " : ""}${s.relation}`); }
  }
  assert.deepEqual(graph, copy);
});
for (const [path, maximum] of [["topics", 12], ["concepts", 100], ["statements", 120], ["statements.0.evidence", 4], ["lessonSections.0.keyPoints", 20], ["concepts.0.aliases", 20], ["statements.0.conditions", 20]]) for (const offset of [-1, 0, 1]) test(`analysis schema collection ${path}:${maximum + offset}`, () => {
  const draft = syntheticDraft(source), parts = path.split(".");
  let parent = draft;
  for (const key of parts.slice(0, -1)) parent = parent[key];
  const key = parts.at(-1), sample = parent[key][0] ?? "Synthetic item";
  parent[key] = Array.from({ length: maximum + offset }, () => structuredClone(sample));
  // Isolates the schema collection bound; duplicate IDs are separately checked by normalization.
  check(`schema-${path}:${maximum + offset}`, () => parseDraft(JSON.stringify(draft)), offset > 0 ? "AI_OUTPUT_INVALID" : undefined);
});
for (const offset of [-1, 0, 1]) test(`analysis output JSON character boundary ${100000 + offset}`, () => {
  const json = JSON.stringify(syntheticDraft(source));
  check(`output-json:${100000 + offset}`, () => parseDraft(json + " ".repeat(100000 + offset - json.length)), offset > 0 ? "AI_OUTPUT_INVALID" : undefined);
});
test("empty optional context rejects a meaningful learner claim; test-only omission isolates cause", () => {
  const d = missing();
  d.claims.push({ id: "c", topicId, subject: "Glucose", relation: "stores", object: "Chemical energy", assertion: explanations.short, negated: false, conditions: [], quote: explanations.short, contextBefore: "" });
  Object.assign(d.comparisons[7], { status: "correct", learnerClaimIds: ["c"] });
  assert.throws(() => normalizeEvaluation(input(explanations.short), JSON.stringify(d)), e => e.code === "AI_OUTPUT_INVALID");
  delete d.claims[0].contextBefore;
  assert.equal(normalizeEvaluation(input(explanations.short), JSON.stringify(d)).comparisons[7].status, "correct");
});
for (const offset of [-1, 0, 1]) test(`evaluation output JSON character boundary ${100000 + offset}`, () => {
  const json = JSON.stringify(missing());
  check(`evaluation-output-json:${100000 + offset}`, () => normalizeEvaluation(input(explanations.short), json + " ".repeat(100000 + offset - json.length)), offset > 0 ? "AI_OUTPUT_INVALID" : undefined);
});
for (const [field, limit] of [["claims", 120], ["comparisons", 120], ["additionalIdeas", 120]]) for (const offset of [-1, 0, 1]) test(`evaluation schema ${field} boundary ${limit + offset}`, () => {
  const samples = { claims: { id: "c", topicId, subject: "Glucose", relation: "stores", object: "energy", assertion: explanations.partial, negated: false, conditions: [], quote: explanations.partial }, comparisons: missing().comparisons[0], additionalIdeas: { topicId, learnerClaimIds: ["c"], explanation: "Outside the source." } };
  const draft = missing(); draft[field] = Array.from({ length: limit + offset }, () => structuredClone(samples[field]));
  assert.equal(matches(draft, EVALUATION_DRAFT_SCHEMA), offset <= 0);
});
function wav(bytes, byteRate = 32000) {
  const b = Buffer.alloc(bytes); b.write("RIFF"); b.writeUInt32LE(bytes - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(byteRate / 2, 24); b.writeUInt32LE(byteRate, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(bytes - 44, 40); return b;
}
for (const offset of [-1, 0, 1]) test(`audio byte boundary ${3000000 + offset}`, () => check(`audio-bytes:${3000000 + offset}`, () => inspectAudio(wav(3000000 + offset)), offset > 0 ? "PAYLOAD_TOO_LARGE" : undefined));
for (const milliseconds of [119999, 120000, 120001]) test(`audio duration boundary ${milliseconds}ms`, () => check(`audio-duration:${milliseconds}ms`, () => inspectAudio(wav(44 + milliseconds * 2, 2000)), milliseconds > 120000 ? "PAYLOAD_TOO_LARGE" : undefined));
test.after(() => { mkdirSync("test-results/v3-audit", { recursive: true }); writeFileSync("test-results/v3-audit/offline.json", JSON.stringify({ provenance: "offline synthetic/mocks", records }, null, 2)); });
