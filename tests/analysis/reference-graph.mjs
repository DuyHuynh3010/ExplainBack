/** Offline endpoint/adapter regressions; the optional saved live audit never calls AI. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { endpointSource, endpointDraft, expectedEndpoints } from "./endpoint-fixture.mjs";
const require = createRequire(import.meta.url);
const { importText } = require("../../test-results/analysis-build/backend/sources/ingest.js");
const { normalizeAnalysisDraft } = require("../../test-results/analysis-build/backend/analysis/normalize.js");
const { parseDraft } = require("../../test-results/analysis-build/backend/analysis/draft.js");
const { validateSourceAnalysis } = require("../../test-results/analysis-build/backend/contracts/validate.js");
const { toReferenceFlow } = require("../../test-results/analysis-build/lib/reference-graph.js");
const triples = graph => graph.statements.map(s => [graph.concepts.find(c => c.id === s.subjectConceptId)?.name, s.relation, graph.concepts.find(c => c.id === s.objectConceptId)?.name]);
const canonical = rows => rows.map(row => row.map(s => s.toLowerCase()).join(" -> ")).sort();

function checkFlow(graph) {
  const original = structuredClone(graph);
  for (const topic of graph.topics) {
    for (const columns of [1, 2, 3]) {
      const flow = toReferenceFlow(graph, topic.id, { columns });
      const nodes = new Map(flow.nodes.map(n => [n.id, n]));
      const concepts = graph.concepts.filter(c => c.topicId === topic.id);
      assert.equal(flow.nodes.length, concepts.length);
      for (const concept of concepts) assert.ok(nodes.has(`${graph.id}:${concept.id}`));
      for (const statement of graph.statements.filter(s => s.topicId === topic.id)) {
        const edge = flow.edges.find(e => e.id === statement.id);
        assert.ok(edge);
        assert.equal(edge.source, `${graph.id}:${statement.subjectConceptId}`);
        assert.equal(edge.target, `${graph.id}:${statement.objectConceptId}`);
        assert.equal(edge.data.statementId, statement.id);
        assert.equal(edge.label, `${statement.negated ? "not " : ""}${statement.relation}`);
        assert.equal(edge.markerEnd.type, "arrowclosed");
        assert.ok(nodes.has(edge.source)); assert.ok(nodes.has(edge.target));
      }
      assert.equal(flow.edges.length, graph.statements.filter(s => s.topicId === topic.id).length);
    }
  }
  assert.deepEqual(graph, original);
}

test("synthetic: normalization preserves the stores target and both produced objects, regardless of collection order", () => {
  for (const reverse of [false, true]) {
    const source = importText(endpointSource);
    const draft = endpointDraft(source);
    if (reverse) { draft.concepts.reverse(); draft.statements.reverse(); }
    const before = structuredClone(draft);
    const analysis = normalizeAnalysisDraft(source, parseDraft(JSON.stringify(draft)));
    assert.deepEqual(canonical(triples(analysis.graph)), canonical(expectedEndpoints));
    assert.equal(analysis.graph.concepts.length, 6); // Only the exact energy duplicate is merged.
    assert.equal(analysis.graph.statements.length, 4);
    assert.equal(validateSourceAnalysis(analysis).valid, true);
    assert.deepEqual(draft, before);
    checkFlow(analysis.graph);
  }
});

test("synthetic: missing object concept fails instead of being redirected to the process", () => {
  const source = importText(endpointSource);
  const draft = endpointDraft(source);
  draft.concepts = draft.concepts.filter(c => c.name !== "Chemical energy");
  assert.throws(() => normalizeAnalysisDraft(source, draft), e => e.code === "AI_OUTPUT_INVALID");
});

test("synthetic: parallel/reverse statements and reordered concepts keep distinct endpoints and labels", () => {
  const source = importText(endpointSource);
  const draft = endpointDraft(source);
  draft.statements.push({ ...structuredClone(draft.statements[2]), id: "parallel", relation: "retains", assertion: "Glucose retains chemical energy." });
  draft.statements.push({ ...structuredClone(draft.statements[2]), id: "reverse", subjectConceptId: "energy-copy", objectConceptId: "product", relation: "is stored in", assertion: "Chemical energy is stored in glucose." });
  const graph = normalizeAnalysisDraft(source, draft).graph;
  graph.concepts.reverse();
  checkFlow(graph);
  assert.equal(graph.statements.length, 6);
  const topic = graph.topics[0].id;
  const flow = toReferenceFlow(graph, topic);
  const stores = flow.edges.find(e => e.label === "stores");
  const reverse = flow.edges.find(e => e.label === "is stored in");
  assert.equal(stores.source, reverse.target);
  assert.equal(stores.target, reverse.source);
});

test("synthetic: a joint subject stays a composite concept, preserving its complete assertion and conditions", () => {
  const source = importText("Carbon dioxide and water jointly produce glucose.");
  const draft = endpointDraft(source);
  draft.concepts = [
    { id: "reactants", topicId: "reference", name: "Carbon dioxide and water", aliases: [] },
    { id: "product", topicId: "reference", name: "Glucose", aliases: [] },
  ];
  draft.statements = [{ ...draft.statements[0], subjectConceptId: "reactants", objectConceptId: "product",
    assertion: source.normalizedText, conditions: ["The reactants act jointly"], evidence: [{ blockId: source.document.blocks[0].id, quote: source.normalizedText }] }];
  draft.lessonSections = [{ topicId: "reference", summary: source.normalizedText, statementIds: ["s0"], keyPoints: [{ text: source.normalizedText, statementIds: ["s0"] }] }];
  const graph = normalizeAnalysisDraft(source, draft).graph;
  assert.deepEqual(triples(graph), [["Carbon dioxide and water", "produces", "Glucose"]]);
  assert.equal(graph.statements[0].assertion, source.normalizedText);
  assert.deepEqual(graph.statements[0].conditions, ["The reactants act jointly"]);
  checkFlow(graph);
});

test("saved live audit: draft -> normalized graph -> React Flow retain every expected relation", async t => {
  let audit;
  try { audit = JSON.parse(await readFile(new URL("../../test-results/reference-graph-live-audit.json", import.meta.url), "utf8")); }
  catch (e) { if (e.code === "ENOENT") { t.skip("No saved live audit; synthetic tests alone do not prove extraction quality."); return; } throw e; }
  assert.equal(audit.upstream.httpStatus, 200);
  assert.equal(audit.calls, 1);
  assert.ok(audit.draft); assert.ok(audit.analysis);
  assert.deepEqual(canonical(triples(audit.draft)), canonical(expectedEndpoints));
  assert.deepEqual(canonical(triples(audit.analysis.graph)), canonical(expectedEndpoints));
  assert.equal(audit.analysis.graph.concepts.length, 6);
  assert.equal(validateSourceAnalysis(audit.analysis).valid, true);
  checkFlow(audit.analysis.graph);
});
