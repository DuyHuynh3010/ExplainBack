import { migrateLegacyDraft } from "./legacy-artifact.mjs";
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
const triples = graph => graph.statements.filter(s => s.representation.kind === "binary").map(s => [graph.concepts.find(c => c.id === s.representation.subjectConceptId)?.name, s.representation.relation, graph.concepts.find(c => c.id === s.representation.objectConceptId)?.name]);
const canonical = rows => rows.map(row => row.map(s => s.toLowerCase()).join(" -> ")).sort();

function checkFlow(graph) {
  const original = structuredClone(graph);
  for (const topic of graph.topics) {
    for (const columns of [1, 2, 3]) {
      const flow = toReferenceFlow(graph, topic.id, { columns });
      const nodes = new Map(flow.nodes.map(n => [n.id, n]));
      const used = new Set(graph.statements.filter(s => s.topicId === topic.id).flatMap(s => s.representation.kind === "binary" ? [s.representation.subjectConceptId, s.representation.objectConceptId] : s.representation.participants.map(p => p.conceptId)));
      const concepts = graph.concepts.filter(c => used.has(c.id));
      assert.equal(flow.nodes.length, concepts.length);
      for (const concept of concepts) assert.ok(nodes.has(`${graph.id}:${concept.id}`));
      for (const statement of graph.statements.filter(s => s.topicId === topic.id && s.representation.kind === "binary")) {
        const edge = flow.edges.find(e => e.id === statement.id);
        assert.ok(edge);
        assert.equal(edge.source, `${graph.id}:${statement.representation.subjectConceptId}`);
        assert.equal(edge.target, `${graph.id}:${statement.representation.objectConceptId}`);
        assert.equal(edge.data.statementId, statement.id);
        assert.ok(edge.label.startsWith(`${statement.negated ? "not " : ""}${statement.representation.relation}`));
        for (const condition of statement.conditions) assert.ok(edge.label.includes(condition));
        assert.equal(edge.markerEnd.type, "arrowclosed");
        assert.ok(nodes.has(edge.source)); assert.ok(nodes.has(edge.target));
      }
      assert.equal(flow.edges.length, graph.statements.filter(s => s.topicId === topic.id && s.representation.kind === "binary").length);
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
  draft.statements.push({ ...structuredClone(draft.statements[2]), id: "parallel", representation: { ...draft.statements[2].representation, relation: "retains" }, assertion: "Glucose retains chemical energy." });
  draft.statements.push({ ...structuredClone(draft.statements[2]), id: "reverse", representation: { kind: "binary", subjectConceptId: "process", objectConceptId: "product", relation: "is stored in" }, assertion: "Chemical energy is stored in glucose." });
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
    { id: "reactants", name: "Carbon dioxide and water", aliases: [] },
    { id: "product", name: "Glucose", aliases: [] },
  ];
  draft.statements = [{ ...draft.statements[0], representation: { kind: "complex", participants: [{ conceptId: "reactants", role: "joint reactants" }, { conceptId: "product", role: "product" }] },
    assertion: source.normalizedText, conditions: ["The reactants act jointly"], evidence: [{ blockId: source.document.blocks[0].id, quote: source.normalizedText }] }];
  draft.lessonSections = [{ topicId: "reference", summary: source.normalizedText, statementIds: ["s0"], keyPoints: [{ text: source.normalizedText, statementIds: ["s0"] }] }];
  const graph = normalizeAnalysisDraft(source, draft).graph;
  assert.deepEqual(triples(graph), []);
  assert.equal(graph.statements[0].representation.kind, "complex");
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
  const current = normalizeAnalysisDraft({ ...audit.importedSource, schemaVersion: "2.0" }, migrateLegacyDraft(audit.draft));
  assert.deepEqual(canonical(triples(current.graph)), canonical(expectedEndpoints));
  assert.deepEqual(canonical(triples({ ...audit.analysis.graph, statements: migrateLegacyDraft({ concepts: [], statements: audit.analysis.graph.statements }).statements })), canonical(expectedEndpoints));
  assert.equal(audit.analysis.graph.concepts.length, 6);
  assert.equal(validateSourceAnalysis(audit.analysis).valid, false); // v1 is explicitly incompatible.
  checkFlow(current.graph);
});
