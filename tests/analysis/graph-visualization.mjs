import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { visualizationDraft, visualizationSource } from "./graph-visualization-fixture.mjs";
const require = createRequire(import.meta.url);
const load = p => require(`../../test-results/analysis-build/${p}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { toReferenceFlow, highlightedGraph } = load("lib/reference-graph");
const { toEvaluatedFlow } = load("lib/evaluated-graph");
const { layoutReferenceGraph } = load("lib/graph-layout");
const importedSource = importText(visualizationSource, "Synthetic visualization fixture");
const analysis = normalizeAnalysisDraft(importedSource, visualizationDraft(importedSource));
analysis.analysisWarnings.push({ code: "EXTRACTION_REVIEW", message: "Synthetic note: review the role assignments against the source." });
mkdirSync("test-results/graph-visualization", { recursive: true });
writeFileSync("test-results/graph-visualization/fixture.json", JSON.stringify({ importedSource, analysis, provenance: "Synthetic visualization only" }));

test("complex canvas preserves every participant, shared concepts, roles and reference IDs", () => {
  const original = structuredClone(analysis);
  for (const topic of analysis.graph.topics) {
    const flow = toReferenceFlow(analysis.graph, topic.id), statements = analysis.graph.statements.filter(s => s.topicId === topic.id);
    assert.equal(flow.nodes.filter(n => n.data.kind === "relation").length, statements.filter(s => s.representation.kind === "complex").length);
    assert.equal(new Set(flow.nodes.map(n => n.id)).size, flow.nodes.length);
    for (const s of statements) {
      const edges = flow.edges.filter(e => e.data.referenceStatementId === s.id);
      if (s.representation.kind === "binary") { assert.equal(edges.length, 1); assert.equal(edges[0].id, s.id); continue; }
      const node = flow.nodes.find(n => n.data.referenceStatementId === s.id);
      assert.ok(node); assert.equal(edges.length, s.representation.participants.length);
      s.representation.participants.forEach((p, i) => {
        const edge = edges[i], concept = `${analysis.graph.id}:${p.conceptId}`;
        assert.equal(edge.label, p.role);
        assert.equal(edge.source, p.role === "output" ? node.id : concept);
        assert.equal(edge.target, p.role === "output" ? concept : node.id);
        assert.equal(!!edge.markerEnd, ["agent", "input", "output"].includes(p.role));
      });
    }
  }
  assert.deepEqual(analysis, original);
});
test("evaluation colors/text apply to original statements, including every complex role; counts stay unchanged", () => {
  const statuses = ["correct", "partial", "missing", "contradicted", "uncertain"];
  const comparisons = analysis.graph.statements.map((s, i) => ({ referenceRelationshipId: s.id, sourceStatements: [{ graphId: analysis.graph.id, statementId: s.id }], status: statuses[i % 5] }));
  for (const topic of analysis.graph.topics) {
    const flow = toEvaluatedFlow(analysis.graph, topic.id, { comparisons });
    for (const e of flow.edges) assert.equal(e.data.status, comparisons.find(c => c.referenceRelationshipId === e.data.referenceStatementId).status);
    for (const n of flow.nodes.filter(n => n.data.kind === "relation")) assert.equal(n.data.status, comparisons.find(c => c.referenceRelationshipId === n.data.referenceStatementId).status);
  }
  assert.equal(comparisons.length, analysis.graph.statements.length);
});
test("concept/statement highlight includes direct neighbors/all roles without moving nodes", () => {
  const flow = toReferenceFlow(analysis.graph, analysis.graph.topics[0].id), relation = flow.nodes.find(n => n.data.kind === "relation");
  const selected = highlightedGraph(flow, { kind: "statement", id: relation.data.referenceStatementId });
  assert.equal(selected.edges.filter(e => e.selected).length, 3);
  assert.equal(selected.nodes.filter(n => n.className === "graph-highlight").length, 4);
  assert.deepEqual(selected.nodes.map(n => n.position), flow.nodes.map(n => n.position));
  assert.equal(highlightedGraph(flow, null), flow);
});
for (const topic of analysis.graph.topics) test(`linked layout: ${topic.title}, deterministic, no node overlap, routed labels`, async () => {
  const flow = toReferenceFlow(analysis.graph, topic.id);
  flow.nodes.forEach(n => { n.measured = { width: Number(n.style.width), height: n.data.kind === "relation" ? 155 : 100 }; });
  const boxes = new Map(flow.edges.map(e => [e.id, { width: 190, height: 85 }]));
  const result = await layoutReferenceGraph(flow.nodes, flow.edges, boxes);
  assert.deepEqual(await layoutReferenceGraph(flow.nodes, flow.edges, boxes), result);
  for (const [i, a] of result.nodes.entries()) for (const b of result.nodes.slice(i + 1)) {
    assert.ok(a.position.x + a.measured.width <= b.position.x || b.position.x + b.measured.width <= a.position.x || a.position.y + a.measured.height <= b.position.y || b.position.y + b.measured.height <= a.position.y, `${a.id} overlaps ${b.id}`);
  }
  for (const e of result.edges) {
    assert.ok(e.data.points.length >= 2); assert.ok(Number.isFinite(e.data.labelPosition.x));
    const label = { x: e.data.labelPosition.x - 95, y: e.data.labelPosition.y - 42.5, w: 190, h: 85 };
    for (const n of result.nodes) {
      const { x, y } = n.position, w = n.measured.width, h = n.measured.height;
      assert.ok(label.x + label.w <= x || x + w <= label.x || label.y + label.h <= y || y + h <= label.y, `Label overlaps ${n.id}`);
      if (n.id === e.source || n.id === e.target) continue;
      for (let i = 1; i < e.data.points.length; i++) {
        const a = e.data.points[i - 1], b = e.data.points[i];
        const crosses = a.x === b.x ? a.x > x + 1 && a.x < x + w - 1 && Math.max(a.y, b.y) > y + 1 && Math.min(a.y, b.y) < y + h - 1
          : a.y > y + 1 && a.y < y + h - 1 && Math.max(a.x, b.x) > x + 1 && Math.min(a.x, b.x) < x + w - 1;
        assert.equal(crosses, false, `Route ${e.id} crosses unrelated node ${n.id}`);
      }
    }
  }
});
