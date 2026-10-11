import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { lessonText, explanationText, lessonDraft, evaluationDraft } from "./explanation-overlay-fixture.mjs";
const require = createRequire(import.meta.url), load = p => require(`../../test-results/analysis-build/${p}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { normalizeEvaluation, handleEvaluationRequest, EVALUATION_INSTRUCTION } = load("backend/explanations/evaluation");
const { validateEvaluationResult } = load("backend/contracts/validate");
const { toComparisonFlow, toExplanationFlow, ADDITIONAL_IDEAS } = load("lib/comparison-graph");
const importedSource = importText(lessonText, "Test-only lesson/explanation overlay");
const analysis = normalizeAnalysisDraft(importedSource, lessonDraft(importedSource));
const text = `${explanationText}\n\nSome plants have medicinal uses.`;
const input = { schemaVersion: "2.0", importedSource, sourceAnalysis: analysis, topicIds: analysis.graph.topics.map(t => t.id), learner: { text } };
const draft = evaluationDraft(analysis, true), evaluation = normalizeEvaluation(input, JSON.stringify(draft));
mkdirSync("test-results/explanation-overlay", { recursive: true });
const exactInput = { ...input, learner: { text: explanationText } };
const exactEvaluation = normalizeEvaluation(exactInput, JSON.stringify(evaluationDraft(analysis)));
writeFileSync("test-results/explanation-overlay/offline.json", JSON.stringify({ importedSource, analysis, evaluation, input, exactInput, exactEvaluation, provenance: "Hand-authored test-only candidates; not AI output" }));

test("reordered multi-topic explanation validates, preserving false claim, independent IDs, conditions and exact quote ranges", () => {
  assert.ok(validateEvaluationResult(analysis, evaluation).valid);
  assert.notEqual(evaluation.learnerGraph.id, analysis.graph.id);
  assert.ok(evaluation.learnerGraph.statements.some(s => s.assertion === "Chlorophyll absorbs green light instead of reflecting it."));
  for (const e of evaluation.learnerGraph.evidence) assert.equal(text.slice(e.location.charRange.start, e.location.charRange.end), e.quote);
  assert.deepEqual(new Set(evaluation.comparisons.map(c => c.status)), new Set(["correct", "partial", "missing", "contradicted", "uncertain"]));
  assert.equal(evaluation.additionalIdeas[0].status, undefined);
  assert.ok(evaluation.learnerGraph.statements.some(s => s.conditions.includes("might")));
  assert.match(EVALUATION_INSTRUCTION, /never copy an unsplit sentence/);
});
test("unsplit blue/red binary projections are rejected with precise issues, while atomic assertions sharing a real quote validate", async () => {
  const broken = structuredClone(draft);
  broken.claims[0].assertion = broken.claims[1].assertion = "Chlorophyll absorbs blue light and red light.";
  assert.throws(() => normalizeEvaluation(input, JSON.stringify(broken)), e => e.issues.some(i => i.path.includes("learnerGraph.statements") && i.code === "invariant"));
  const response = await handleEvaluationRequest(new Request("http://local/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }), { generate: async () => ({ text: JSON.stringify(broken), finishReason: "stop" }) });
  assert.equal(response.status, 502);
  const body = await response.json(); assert.ok(body.error.details.some(i => i.path.includes("learnerGraph.statements") && i.message.startsWith("repeated_conjunctive_assertion:")));
  assert.ok(!JSON.stringify(body).includes(text));
});
test("schema, unknown IDs, missing quote and duplicate/unsupported alignment provide field paths, without relaxing validation", () => {
  for (const [field, mutate] of [
    ["claims[0].quote", d => d.claims[0].quote = "fabricated"],
    ["claims[0].representation", d => d.claims[0].representation.subjectConceptId = "unknown"],
    ["conceptAlignments", d => d.conceptAlignments.push(d.conceptAlignments[0])],
    ["conceptAlignments", d => d.conceptAlignments[0].referenceConceptId = "unknown"],
  ]) { const d = structuredClone(draft); mutate(d); assert.throws(() => normalizeEvaluation(input, JSON.stringify(d)), e => e.issues.some(i => i.path.includes(field))); }
});
test("explanation flow uses learner assertions only, has all claims including additional, and never fills missing oxygen", () => {
  const flow = toExplanationFlow(evaluation);
  assert.equal(flow.details.length, 8); assert.ok(flow.details.every(d => !d.lesson.length));
  assert.ok(flow.edges.some(e => e.data.assertion.includes("absorbs green")));
  assert.ok(!flow.nodes.some(n => n.data.label === "Oxygen"));
  assert.ok(flow.nodes.every(n => !n.data.status));
});
test("one overlay shares explicit concept identities, combines correct provenance and preserves two opposing green-light edges", () => {
  const snapshot = JSON.stringify({ analysis, evaluation }), flow = toComparisonFlow(analysis.graph, evaluation);
  const chlorophyll = flow.nodes.filter(n => n.data.kind === "concept" && n.data.label === "Chlorophyll");
  assert.equal(chlorophyll.length, 1); assert.equal(chlorophyll[0].data.identities.length, 2);
  const green = flow.edges.filter(e => e.data.assertion.includes("green light"));
  assert.equal(green.length, 2); assert.deepEqual(new Set(green.map(e => e.data.origin)), new Set(["lesson", "explanation"]));
  assert.equal(green[0].source, green[1].source); assert.equal(green[0].target, green[1].target);
  assert.equal(green.find(e => e.data.origin === "lesson").data.status, undefined);
  assert.equal(green.find(e => e.data.origin === "explanation").data.status, "contradicted");
  assert.ok(flow.edges.some(e => e.data.origin === "both" && e.data.identities.length === 2));
  assert.equal(new Set(flow.edges.map(e => e.id)).size, flow.edges.length);
  assert.ok(flow.details.some(d => d.comparison?.status === "missing" && d.learner.length === 0));
  assert.ok(!flow.edges.some(e => String(e.label).includes("Lesson · contradicted")));
  assert.equal(flow.details.filter(d => d.comparison).length, analysis.graph.statements.length);
  assert.equal(JSON.stringify({ analysis, evaluation }), snapshot);
});
test("uncertain complex claims remain two relation nodes; counts use claims, not participant connections", () => {
  const topic = analysis.graph.topics.find(t => t.title === "Food chains").id;
  const flow = toComparisonFlow(analysis.graph, evaluation, topic);
  assert.equal(flow.nodes.filter(n => n.data.kind === "relation").length, 3);
  assert.equal(flow.nodes.find(n => n.data.kind === "relation" && n.data.origin === "both").data.status, "correct");
  assert.equal(flow.details.length, 2); assert.equal(flow.edges.length, 9);
});
test("topic/order independence, additional ideas and no label-only forced concept merges", () => {
  const copy = structuredClone(evaluation); copy.comparisons.reverse(); copy.learnerGraph.statements.reverse(); copy.topicIds.reverse();
  const light = analysis.graph.topics.find(t => t.title === "Chlorophyll").id;
  const f = toComparisonFlow(analysis.graph, copy, light);
  assert.equal(f.details.length, 5); assert.equal(toExplanationFlow(copy, light).details.length, 3);
  assert.equal(toComparisonFlow(analysis.graph, copy, ADDITIONAL_IDEAS).details.length, 1);
  delete copy.conceptAlignments;
  const separate = toComparisonFlow(analysis.graph, copy, light);
  assert.equal(separate.nodes.filter(n => n.data.label === "Chlorophyll").length, 2);
});
test("observed live polarity failure is rejected; explicit faithful negative assertion and modal complex claim remain valid", () => {
  const broken = structuredClone(draft);
  broken.claims[2].assertion = "Chlorophyll reflects green light.";
  broken.claims[2].representation.relation = "reflects";
  broken.claims[2].negated = true;
  assert.throws(() => normalizeEvaluation(input, JSON.stringify(broken)), e => e.issues.some(i => i.path.endsWith("statements[2].negated")));
  broken.claims[2].assertion = "Chlorophyll does not reflect green light.";
  const fixed = normalizeEvaluation(input, JSON.stringify(broken));
  assert.equal(fixed.learnerGraph.statements[2].negated, true);
  assert.equal(fixed.learnerGraph.statements[2].assertion, "Chlorophyll does not reflect green light.");
  assert.equal(fixed.learnerGraph.statements[6].negated, false);
  assert.ok(fixed.learnerGraph.statements[6].assertion.includes("not sure whether"));
  assert.match(EVALUATION_INSTRUCTION, /expresses uncertainty, NOT/);
});
test("a shared learner claim remains one claim, highlights for each reference and gets no arbitrary first verdict", () => {
  const copy = structuredClone(evaluation);
  const learner = copy.learnerGraph.statements.find(s => s.assertion.startsWith("Herbivores"));
  const original = copy.comparisons.find(c => c.learnerStatements.some(r => r.statementId === learner.id));
  const other = copy.comparisons.find(c => c.id !== original.id && c.status === "correct");
  other.status = "partial";
  other.learnerStatements.push({ graphId: copy.learnerGraph.id, statementId: learner.id });
  const refs = [original, other];
  // This additional synthetic link tests rendering/coverage only, not entailment.
  assert.ok(validateEvaluationResult(analysis, copy).valid);
  const flow = toComparisonFlow(analysis.graph, copy);
  const node = flow.nodes.find(n => n.data.referenceStatementId === learner.id);
  assert.equal(node.data.status, undefined); assert.equal(node.data.statusNote, "See matched comparisons");
  const connections = flow.edges.filter(e => e.data.referenceStatementId === learner.id);
  assert.equal(connections.length, learner.representation.participants.length);
  assert.ok(connections.every(e => refs.every(c => e.data.selectionIds.includes(c.id))));
});
