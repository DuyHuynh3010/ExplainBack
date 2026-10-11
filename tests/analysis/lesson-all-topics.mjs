/** Synthetic offline fixture: three topics, shared concepts and a complex claim. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const load = p => require(`../../test-results/analysis-build/${p}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { validateSourceAnalysis } = load("backend/contracts/validate");
const { toLessonFlow, ALL_TOPICS } = load("lib/comparison-graph");
const { highlightedGraph } = load("lib/reference-graph");

const topics = [{ id: "growth", title: "Plant growth" }, { id: "storage", title: "Energy storage" }, { id: "light", title: "Light absorption" }];
const concepts = ["Plants", "Sunlight", "Glucose", "Chemical energy", "Chlorophyll", "Light energy"].map((name, i) => ({ id: `c${i}`, name, aliases: [] }));
const claims = [
  ["growth", "Plants use sunlight to produce glucose.", { kind: "complex", participants: [{ conceptId: "c0", role: "agent" }, { conceptId: "c1", role: "input" }, { conceptId: "c2", role: "output" }] }],
  ["storage", "Glucose stores chemical energy.", { kind: "binary", subjectConceptId: "c2", relation: "stores", objectConceptId: "c3" }],
  ["light", "Chlorophyll absorbs light energy.", { kind: "binary", subjectConceptId: "c4", relation: "absorbs", objectConceptId: "c5" }],
  ["light", "Light energy reaches plants.", { kind: "binary", subjectConceptId: "c5", relation: "reaches", objectConceptId: "c0" }],
  ["light", "Plants contain chlorophyll.", { kind: "binary", subjectConceptId: "c0", relation: "contain", objectConceptId: "c4" }],
];
const importedSource = importText(claims.map(c => c[1]).join("\n\n"), "Synthetic Lesson All topics fixture");
const statements = claims.map(([topicId, assertion, representation], i) => ({ id: `s${i}`, topicId, assertion, representation, negated: false, conditions: [], role: "fact",
  evidence: [{ blockId: importedSource.document.blocks[i].id, quote: assertion }] }));
const analysis = normalizeAnalysisDraft(importedSource, {
  topics, concepts, statements,
  blockDispositions: importedSource.document.blocks.map(b => ({ blockId: b.id, kind: "knowledge" })),
  lessonSections: topics.map(t => { const ss = statements.filter(s => s.topicId === t.id); return {
    topicId: t.id, summary: ss.map(s => s.assertion).join(" "), statementIds: ss.map(s => s.id),
    keyPoints: ss.map(s => ({ text: s.assertion, statementIds: [s.id] })),
  }; }),
});
const directory = ".explainback-artifacts/lesson-all-topics";
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/fixture.json`, JSON.stringify({ importedSource, analysis, provenance: "Synthetic offline data; no real AI calls." }));

test("Lesson All topics preserves every claim, endpoint, participant and shared concept once", () => {
  assert.equal(validateSourceAnalysis(analysis).valid, true);
  const before = structuredClone(analysis), flow = toLessonFlow(analysis.graph, ALL_TOPICS);
  assert.equal(analysis.graph.topics.length, 3);
  assert.deepEqual(flow.details.map(d => d.id), analysis.graph.statements.map(s => s.id));
  assert.equal(new Set(flow.nodes.map(n => n.id)).size, flow.nodes.length);
  assert.equal(flow.nodes.filter(n => n.data.kind === "concept").length, analysis.graph.concepts.length);
  assert.equal(flow.nodes.filter(n => n.data.kind === "relation").length, 1);
  assert.equal(flow.edges.length, 7);
  assert.equal(new Set(flow.edges.map(e => e.id)).size, flow.edges.length);
  for (const s of analysis.graph.statements) {
    const edges = flow.edges.filter(e => e.data.referenceStatementId === s.id);
    assert.equal(flow.details.find(d => d.id === s.id).lesson[0], s);
    if (s.representation.kind === "binary") {
      assert.equal(edges[0].source, `${analysis.graph.id}:${s.representation.subjectConceptId}`);
      assert.equal(edges[0].target, `${analysis.graph.id}:${s.representation.objectConceptId}`);
    } else assert.equal(edges.length, s.representation.participants.length);
    for (const edge of edges) assert.equal(edge.data.status, undefined);
  }
  const glucose = analysis.graph.concepts.find(c => c.name === "Glucose");
  assert.equal(flow.nodes.filter(n => n.id === `${analysis.graph.id}:${glucose.id}`).length, 1);
  const complex = analysis.graph.statements[0];
  assert.equal(highlightedGraph(flow, { kind: "statement", id: complex.id }).edges.filter(e => e.selected).length, 3);
  assert.deepEqual(analysis, before);
});

test("Lesson topic 1 -> All -> topic 2 selects only cached scope, with original evidence/detail IDs", () => {
  for (const id of [analysis.graph.topics[0].id, ALL_TOPICS, analysis.graph.topics[1].id]) {
    const flow = toLessonFlow(analysis.graph, id);
    const expected = analysis.graph.statements.filter(s => id === ALL_TOPICS || s.topicId === id);
    assert.deepEqual(flow.details.map(d => d.id), expected.map(s => s.id));
    for (const detail of flow.details) {
      assert.equal(detail.learner.length, 0);
      for (const evidenceId of detail.lesson[0].evidenceIds) assert.ok(analysis.graph.evidence.some(e => e.id === evidenceId));
    }
  }
});

test("Lesson All topics retains parallel binary relations without changing their IDs or direction", () => {
  const graph = structuredClone(analysis.graph), base = graph.statements.find(s => s.representation.kind === "binary");
  const parallel = { ...base, id: "parallel", representation: { ...base.representation, relation: "retains" }, assertion: "Synthetic parallel relation for adapter testing only." };
  graph.statements.push(parallel);
  const flow = toLessonFlow(graph, ALL_TOPICS);
  const a = flow.edges.find(e => e.id === base.id), b = flow.edges.find(e => e.id === parallel.id);
  assert.equal(a.source, b.source); assert.equal(a.target, b.target);
  assert.notEqual(a.id, b.id); assert.notEqual(a.label, b.label);
});
