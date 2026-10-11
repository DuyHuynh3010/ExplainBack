/** Synthetic regression: original failed live draft is not available locally. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const load = file => require(`../../test-results/analysis-build/${file}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { parseDraft } = load("backend/analysis/draft");
const { validateSourceAnalysis } = load("backend/contracts/validate");
const { toReferenceFlow } = load("lib/reference-graph");
const { analyzeImportedSource } = load("backend/analysis/pipeline");

function fixture(assertion, subject, relation, object, negated, conditions = []) {
  const source = importText(assertion), blockId = source.document.blocks[0].id;
  const draft = {
    topics: [{ id: "topic", title: "Synthetic polarity regression" }],
    concepts: [{ id: "subject", name: subject, aliases: [] }, { id: "object", name: object, aliases: [] }],
    statements: [{ id: "claim", topicId: "topic", assertion, negated, conditions, role: "fact",
      representation: { kind: "binary", subjectConceptId: "subject", relation, objectConceptId: "object" },
      evidence: [{ blockId, quote: assertion }] }],
    blockDispositions: [{ blockId, kind: "knowledge" }],
    lessonSections: [{ topicId: "topic", summary: assertion, statementIds: ["claim"], keyPoints: [{ text: assertion, statementIds: ["claim"] }] }],
  };
  return { source, draft };
}

const cases = [
  ["nested absence in property", "A tree is a connected graph with no cycles.", "Tree", "is", "Connected graph with no cycles", false],
  ["direct no determiner", "A tree has no cycles.", "Tree", "has", "Cycles", true],
  ["explicit predicate denial", "A tree does not contain cycles.", "Tree", "contains", "Cycles", true],
  ["affirmative predicate", "A graph contains a cycle.", "Graph", "contains", "Cycle", false],
  ["complete absence concept", "A tree has no cycles.", "Tree", "has", "No cycles", false],
  ["absence in unrelated domain", "A database contains no records.", "Database", "contains", "Records", true],
];
for (const [name, ...args] of cases) {
  test(`valid ${name}: polarity, assertion, endpoints and evidence survive unchanged`, () => {
    const { source, draft } = fixture(...args), before = structuredClone(draft);
    const analysis = normalizeAnalysisDraft(source, parseDraft(JSON.stringify(draft)));
    assert.deepEqual(draft, before);
    assert.equal(validateSourceAnalysis(analysis).valid, true);
    const statement = analysis.graph.statements[0], evidence = analysis.graph.evidence[0];
    assert.equal(statement.assertion, args[0]); assert.equal(statement.negated, args[4]);
    assert.deepEqual(statement.conditions, []);
    assert.equal(evidence.quote, args[0]); assert.equal(evidence.verification, "verified");
    assert.equal(analysis.document.blocks[0].text.slice(evidence.location.charRange.start, evidence.location.charRange.end), args[0]);
    assert.deepEqual(analysis.lessonSections[0].statementIds, [statement.id]);
    const edge = toReferenceFlow(analysis.graph, statement.topicId).edges[0];
    assert.equal(edge.source, `${analysis.graph.id}:${statement.representation.subjectConceptId}`);
    assert.equal(edge.target, `${analysis.graph.id}:${statement.representation.objectConceptId}`);
    assert.equal(String(edge.label).startsWith("not "), args[4]);
  });
  test(`invalid ${name}: inconsistent polarity is still rejected`, () => {
    const { source, draft } = fixture(...args); draft.statements[0].negated = !args[4];
    assert.throws(() => normalizeAnalysisDraft(source, draft), e => e.issues.some(i => i.path.endsWith(".negated")));
  });
}

test("not necessarily preserves scope rather than reversing certainty", () => {
  const f = fixture("A graph is not necessarily a tree.", "Graph", "is", "Tree", false, ["Not necessarily"]);
  const before = structuredClone(f.draft), a = normalizeAnalysisDraft(f.source, f.draft);
  assert.deepEqual(f.draft, before); assert.equal(a.graph.statements[0].negated, false);
  assert.deepEqual(a.graph.statements[0].conditions, ["Not necessarily"]);
  assert.ok(a.analysisWarnings.some(w => w.code === "EXTRACTION_REVIEW"));
  f.draft.statements[0].negated = true;
  assert.throws(() => normalizeAnalysisDraft(f.source, f.draft), e => e.issues.some(i => i.path.endsWith(".negated")));
});

test("not sure whether remains a modal claim, not a positive or negative cycle verdict", () => {
  const f = fixture("I am not sure whether this graph contains a cycle.", "Graph", "contains", "Cycle", false, ["I am not sure whether this graph contains a cycle."]);
  f.draft.statements[0].representation = { kind: "complex", participants: [{ conceptId: "subject", role: "uncertain subject" }, { conceptId: "object", role: "possible object, not asserted" }] };
  const before = structuredClone(f.draft), a = normalizeAnalysisDraft(f.source, f.draft);
  assert.deepEqual(f.draft, before); assert.equal(a.graph.statements[0].negated, false);
  assert.equal(a.graph.statements[0].assertion, f.draft.statements[0].assertion);
  assert.equal(a.graph.statements[0].representation.kind, "complex");
  assert.deepEqual(a.graph.statements[0].conditions, f.draft.statements[0].conditions);
});

test("wrong endpoint and double-negative relation remain blocked", () => {
  const f = fixture("A tree has no cycles.", "Tree", "has", "Cycles", true);
  f.draft.concepts.push({ id: "wrong", name: "Edges", aliases: [] });
  f.draft.statements[0].representation.objectConceptId = "wrong";
  f.draft.statements[0].negated = false;
  // A mismatch without a literal competing head remains review-only, as before.
  f.draft.concepts.push({ id: "actual", name: "No cycles", aliases: [] });
  assert.throws(() => normalizeAnalysisDraft(f.source, f.draft), e => e.issues.some(i => i.path.endsWith(".objectConceptId")));
  f.draft.statements[0].representation.objectConceptId = "object";
  f.draft.statements[0].representation.relation = "does not contain";
  f.draft.statements[0].negated = true;
  assert.throws(() => normalizeAnalysisDraft(f.source, f.draft), e => e.issues.some(i => i.path.endsWith(".relation")));
});

test("nested outer denial is review-only, never automatically inverted", () => {
  const f = fixture("A tree does not have no cycles.", "Tree", "have", "Cycles", true);
  const a = normalizeAnalysisDraft(f.source, f.draft);
  assert.equal(a.graph.statements[0].negated, true);
  assert.ok(a.analysisWarnings.some(w => /Nested predicate/.test(w.message)));
});

test("unchanged new live initial/repair captures replay through the actual pipeline", async t => {
  const dir = "test-results/source-polarity";
  if (!existsSync(`${dir}/live-api.json`)) return t.skip("Private new live capture absent; this is not the old failing request.");
  const { request, body } = JSON.parse(readFileSync(`${dir}/live-api.json`, "utf8"));
  const outputs = [1, 2].map(i => {
    const raw = JSON.parse(readFileSync(`${dir}/generation-${i}.json`, "utf8"));
    assert.equal(raw.status, 200); assert.equal(raw.candidates[0].finishReason, "STOP");
    return raw.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join("");
  });
  let calls = 0;
  const analysis = await analyzeImportedSource(request, { async generate() { return { text: outputs[calls++], finishReason: "stop" }; } });
  assert.equal(calls, 2); assert.equal(validateSourceAnalysis(analysis).valid, true);
  assert.deepEqual(analysis.document, request.importedSource.document);
  assert.deepEqual(analysis.graph.statements.map(s => [s.assertion, s.negated]), body.data.graph.statements.map(s => [s.assertion, s.negated]));
  const statement = analysis.graph.statements.find(s => s.assertion === "A tree is a connected graph with no cycles.");
  assert.ok(statement); assert.equal(statement.negated, false); assert.equal(statement.representation.kind, "complex");
  for (const e of analysis.graph.evidence) {
    const block = analysis.document.blocks.find(b => b.id === e.blockId);
    assert.equal(block.text.slice(e.location.charRange.start, e.location.charRange.end), e.quote);
  }
});
