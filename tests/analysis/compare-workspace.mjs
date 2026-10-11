/** Synthetic UI candidates, validated through the real contracts. Zero AI calls. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url), load = p => require(`../../test-results/analysis-build/${p}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { normalizeEvaluation } = load("backend/explanations/evaluation");
const { validateEvaluationResult, validateImportedAnalysisResponse } = load("backend/contracts/validate");
const { toComparisonFlow } = load("lib/comparison-graph");
const { selectionNodeIds } = load("lib/reference-graph");
const sourceClaims = [
  "For finite sets, |A union B| = |A| + |B| - |A intersection B|.",
  "A bijection is injective and surjective.",
  "A graph contains a cycle.",
  "A function assigns exactly one output to each input.",
  "A sensor transmits signals while enabled.",
  "A valve releases water.",
];
const learnerClaims = [
  "For finite sets, |A union B| = |A| + |B| + |A intersection B|.",
  "A graph contains a cycle.",
  "A function assigns exactly two outputs to each input.",
  "A sensor transmits signals.",
  "I am not sure whether a valve releases water.",
  "Some plants have medicinal uses.",
];
function builder() {
  const concepts = [];
  const concept = name => { let c = concepts.find(c => c.name === name); if (!c) { c = { id: `concept-${concepts.length}`, name, aliases: [] }; concepts.push(c); } return c.id; };
  const binary = (subject, relation, object) => ({ kind: "binary", subjectConceptId: concept(subject), relation, objectConceptId: concept(object) });
  const complex = () => ({ kind: "complex", participants: [["Function", "agent"], ["Input", "input"], ["Output", "output"]].map(([name, role]) => ({ conceptId: concept(name), role })) });
  return { concepts, concept, binary, complex };
}
const importedSource = importText(`Set counting\n\n${sourceClaims.slice(0,3).join("\n\n")}\n\nMappings\n\n${sourceClaims.slice(3).join("\n\n")}`, "Synthetic Compare demo, not AI output");
const b = builder();
const representations = [b.binary("|A union B|", "equals", "|A| + |B| - |A intersection B|"),
  { kind: "complex", participants: [["Bijection", "subject"], ["Injective", "property"], ["Surjective", "property"]].map(([name, role]) => ({ conceptId: b.concept(name), role })) },
  b.binary("Graph", "contains", "Cycle"), b.complex(), b.binary("Sensor", "transmits", "Signals"), b.binary("Valve", "releases", "Water")];
const draft = {
  topics: [{ id: "sets", title: "Set counting" }, { id: "maps", title: "Mappings" }], concepts: b.concepts,
  statements: sourceClaims.map((assertion, i) => ({ id: `reference-${i}`, topicId: i < 3 ? "sets" : "maps", assertion, representation: representations[i], negated: false,
    conditions: i === 0 ? ["For finite sets"] : i === 3 ? ["Exactly one output per input"] : i === 4 ? ["While enabled"] : [],
    ...(i === 0 ? { formula: "|A union B| = |A| + |B| - |A intersection B|" } : {}), role: "fact", evidence: [{ blockId: importedSource.document.blocks.find(b => b.text.includes(assertion)).id, quote: assertion }] })),
  blockDispositions: importedSource.document.blocks.map(b => ({ blockId: b.id, kind: sourceClaims.includes(b.text) ? "knowledge" : "other" })),
  lessonSections: ["sets", "maps"].map(topicId => { const ids = sourceClaims.flatMap((_, i) => (i < 3 ? "sets" : "maps") === topicId ? [`reference-${i}`] : []); return { topicId, summary: "Synthetic supported claims for an offline UI demo.", statementIds: ids, keyPoints: [{ text: "Review the linked source claims.", statementIds: ids }] }; }),
};
const analysis = normalizeAnalysisDraft(importedSource, draft), l = builder();
const learnerReps = [l.binary("|A union B|", "equals", "|A| + |B| + |A intersection B|"), l.binary("Graph", "contains", "Cycle"), l.complex(), l.binary("Sensor", "transmits", "Signals"),
  { kind: "complex", participants: [{ conceptId: l.concept("Valve"), role: "uncertain subject" }, { conceptId: l.concept("Water"), role: "possible output" }] }, l.binary("Plants", "have", "Medicinal uses")];
const claims = learnerClaims.map((assertion, i) => ({ id: `learner-${i}`, assertion, representation: learnerReps[i], quote: assertion, negated: false,
  conditions: i === 0 ? ["For finite sets"] : i === 2 ? ["Exactly two outputs per input"] : i === 4 ? ["Not sure whether"] : i === 5 ? ["Some plants"] : [],
  ...(i === 0 ? { formula: "|A union B| = |A| + |B| + |A intersection B|" } : {}) }));
const verdicts = [["contradicted", ["learner-0"], "The explanation adds the intersection instead of subtracting it."],
  ["missing", [], "The definition of a bijection is not mentioned in this explanation; this does not establish a lack of understanding."],
  ["correct", ["learner-1"], "Both claims state that the graph contains a cycle."],
  ["contradicted", ["learner-2"], "The lesson assigns exactly one output per input; the explanation assigns two."],
  ["partial", ["learner-3"], "The explanation mentions transmission but omits the condition while enabled."],
  ["uncertain", ["learner-4"], "The explanation expresses uncertainty, rather than affirming or denying that the valve releases water."]];
const input = { schemaVersion: "2.0", importedSource, sourceAnalysis: analysis, topicIds: analysis.graph.topics.map(t => t.id), learner: { text: learnerClaims.join("\n\n") } };
const evaluation = normalizeEvaluation(input, JSON.stringify({ concepts: l.concepts, claims,
  comparisons: analysis.graph.statements.map((s, i) => ({ referenceRelationshipId: s.id, status: verdicts[i][0], learnerClaimIds: verdicts[i][1], explanation: verdicts[i][2], suggestions: [] })),
  conceptAlignments: l.concepts.flatMap(c => { const ref = analysis.graph.concepts.find(r => r.name === c.name); return ref ? [{ learnerConceptId: c.id, referenceConceptId: ref.id, status: "matched", explanation: "Synthetic confirmed identity for the UI test." }] : []; }),
  additionalIdeas: [{ learnerClaimIds: ["learner-5"], explanation: "Medicinal uses are outside this lesson; no correctness verdict is inferred." }],
}));
mkdirSync("test-results/compare-workspace", { recursive: true });
writeFileSync("test-results/compare-workspace/fixture.json", JSON.stringify({ provenance: "Synthetic validated UI fixture, not live AI", importedSource, analysis, evaluation, input }, null, 2));

test("demo fixture validates, covers every status and preserves true source/learner quotes", () => {
  assert.equal(validateImportedAnalysisResponse({ schemaVersion: "2.0", importedSource }, { ok: true, schemaVersion: "2.0", data: analysis }).valid, true);
  assert.equal(validateEvaluationResult(analysis, evaluation).valid, true);
  assert.deepEqual(new Set(evaluation.comparisons.map(c => c.status)), new Set(["correct", "partial", "missing", "contradicted", "uncertain"]));
});
test("binary formula mismatch keeps both claims, two endpoints, formula and neutral reference", () => {
  const before = JSON.stringify({ analysis, evaluation }), flow = toComparisonFlow(analysis.graph, evaluation);
  const c = evaluation.comparisons[0], edges = flow.edges.filter(e => e.data.selectionIds.includes(c.id));
  assert.equal(edges.length, 2); assert.equal(edges[0].source, edges[1].source); assert.notEqual(edges[0].target, edges[1].target);
  assert.equal(edges.find(e => e.data.origin === "lesson").data.status, undefined);
  assert.equal(edges.find(e => e.data.origin === "lesson").style.strokeDasharray, "7 4");
  assert.equal(edges.find(e => e.data.origin === "explanation").data.status, "contradicted");
  assert.equal(edges.find(e => e.data.origin === "explanation").style.strokeDasharray, undefined);
  const d = flow.details.find(d => d.id === c.id);
  assert.match(d.lesson[0].formula, / - /); assert.match(d.learner[0].formula, / \+ \|A intersection/);
  assert.equal(selectionNodeIds(flow, { kind: "statement", id: c.id }).size, 3);
  assert.equal(JSON.stringify({ analysis, evaluation }), before);
});
test("complex mismatch retains both cards; role connections are not separately graded errors", () => {
  const flow = toComparisonFlow(analysis.graph, evaluation), c = evaluation.comparisons[3];
  const cards = flow.nodes.filter(n => n.data.kind === "relation" && n.data.selectionIds?.includes(c.id));
  assert.equal(cards.length, 2); assert.equal(cards.find(n => n.data.origin === "lesson").data.status, undefined);
  assert.equal(cards.find(n => n.data.origin === "explanation").data.status, "contradicted");
  const edges = flow.edges.filter(e => e.data.selectionIds.includes(c.id));
  assert.equal(edges.length, 6); assert.ok(edges.every(e => e.data.status === undefined));
  const ids = selectionNodeIds(flow, { kind: "statement", id: c.id }); assert.ok(cards.every(n => ids.has(n.id)));
});
test("missing and additional have no invented counterpart; no alignment is inferred from labels", () => {
  const flow = toComparisonFlow(analysis.graph, evaluation);
  assert.equal(flow.details.find(d => d.comparison?.status === "missing").learner.length, 0);
  assert.equal(flow.details.find(d => d.additionalExplanation).lesson.length, 0);
  const copy = structuredClone(evaluation); delete copy.conceptAlignments;
  const unaligned = toComparisonFlow(analysis.graph, copy);
  assert.equal(unaligned.nodes.filter(n => n.data.label === "Graph").length, 2);
});
test("correct does not erase different relation, conditions, formula or polarity", () => {
  for (const field of ["assertion", "formula", "conditions", "relation", "negated"]) {
    const copy = structuredClone(evaluation), c = copy.comparisons[2], claim = copy.learnerGraph.statements.find(s => s.id === c.learnerStatements[0].statementId);
    if (field === "relation") claim.representation.relation = "includes";
    else if (field === "conditions") claim.conditions = ["When inspected"];
    else if (field === "negated") claim.negated = true;
    else claim[field] = "Different original content";
    const edges = toComparisonFlow(analysis.graph, copy).edges.filter(e => e.data.selectionIds.includes(c.id));
    assert.equal(edges.length, 2); assert.ok(edges.every(e => e.data.origin !== "both"));
  }
});
