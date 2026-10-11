/** Offline inspection of saved real AI drafts. No network or product mutation. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { explanations } from "./v3-fixtures.mjs";
const require = createRequire(import.meta.url);
const load = file => require(`../../test-results/analysis-build/${file}.js`);
const { normalizeEvaluation, EVALUATION_DRAFT_SCHEMA } = load("backend/explanations/evaluation");
const { matches } = load("backend/analysis/draft");
const { toReferenceFlow } = load("lib/reference-graph");
const { validateSourceAnalysis } = load("backend/contracts/validate");
const dir = "test-results/v3-audit";
const ready = existsSync(`${dir}/contradiction-live.json`);
const read = name => JSON.parse(readFileSync(`${dir}/${name}-live.json`, "utf8"));
const triples = g => g.statements.map(s => [g.concepts.find(c => c.id === s.subjectConceptId).name, s.relation, g.concepts.find(c => c.id === s.objectConceptId).name, s.assertion, s.negated, s.conditions]);
test("captured real graph: normalization and adapter preserve the draft, including its semantic errors", { skip: !ready }, () => {
  const capture = read("analysis"), graph = capture.response.data.graph;
  assert.equal(validateSourceAnalysis(capture.response.data).valid, true);
  assert.deepEqual(triples(graph), triples(capture.draft));
  const used = new Set(graph.statements.flatMap(s => [s.subjectConceptId, s.objectConceptId]));
  const isolated = graph.concepts.filter(c => !used.has(c.id)).map(c => c.name);
  for (const topic of graph.topics) {
    const flow = toReferenceFlow(graph, topic.id);
    for (const s of graph.statements.filter(s => s.topicId === topic.id)) {
      const edge = flow.edges.find(e => e.id === s.id);
      assert.equal(edge.source, `${graph.id}:${s.subjectConceptId}`);
      assert.equal(edge.target, `${graph.id}:${s.objectConceptId}`);
    }
  }
  writeFileSync(`${dir}/graph-chain.json`, JSON.stringify({ provenance: "Saved real draft/response; structural checks plus manual semantic review", endpoints: triples(graph), isolated, draftConcepts: capture.draft.concepts.length, normalizedConcepts: graph.concepts.length, draftStatements: capture.draft.statements.length, normalizedStatements: graph.statements.length }, null, 2));
});
test("captured paraphrase: only empty optional contexts cause the observed schema rejection", { skip: !ready }, () => {
  const capture = read("paraphrase"), draft = structuredClone(capture.draft);
  assert.equal(capture.response.error.code, "AI_OUTPUT_INVALID");
  assert.equal(matches(draft, EVALUATION_DRAFT_SCHEMA), false);
  assert.throws(() => normalizeEvaluation(capture.request, JSON.stringify(draft)), e => e.code === "AI_OUTPUT_INVALID");
  const omitted = [];
  for (const [index, claim] of draft.claims.entries()) for (const key of ["contextBefore", "contextAfter"]) if (claim[key] === "") { omitted.push(`claims[${index}].${key}`); delete claim[key]; }
  assert.equal(matches(draft, EVALUATION_DRAFT_SCHEMA), true);
  const replay = normalizeEvaluation(capture.request, JSON.stringify(draft));
  assert.ok(replay.comparisons.every(c => c.status === "correct"));
  writeFileSync(`${dir}/paraphrase-cause.json`, JSON.stringify({ provenance: "Offline replay only, not a successful live evaluation response", omitted, statusesAfterTestOnlyOmission: replay.comparisons.map(c => c.status) }, null, 2));
});
test("captured short and contradiction: source IDs, missing and actual learner quotes", { skip: !ready }, () => {
  const short = read("short"), contradiction = read("contradiction");
  assert.deepEqual(short.response.data.comparisons.map(c => c.status).sort(), ["correct", "missing", "missing", "missing", "missing", "missing"]);
  const result = contradiction.response.data;
  const opposite = result.comparisons.filter(c => c.status === "contradicted");
  assert.equal(opposite.length, 2);
  for (const c of opposite) for (const ref of c.learnerStatements) for (const id of result.learnerGraph.statements.find(s => s.id === ref.statementId).evidenceIds) {
    const e = result.learnerGraph.evidence.find(e => e.id === id);
    assert.equal(e.verification, "verified");
    assert.equal(contradiction.request.learner.text.slice(e.location.charRange.start, e.location.charRange.end), e.quote);
  }
  assert.ok(result.comparisons.filter(c => c.status === "missing").every(c => !c.learnerStatements.length));
  assert.equal(result.sourceAnalysisId, short.request.sourceAnalysis.id);
});

test("offline cases use the exact saved reference IDs; extra ideas and partial stay distinct", { skip: !ready }, () => {
  const saved = read("short"), source = saved.request.sourceAnalysis, topicId = source.graph.topics[0].id;
  // Expectations refer to assertions, not the two known bad self-loop endpoints.
  // Index 1 is a non-atomic reference; use uncertain for incomplete matching.
  const cases = {
    missing: { statuses: ["correct", "uncertain", "missing", "missing", "missing", "missing"], claims: [[0, "Plants", "use", "sunlight", "Plants use sunlight for photosynthesis."], [1, "Photosynthesis", "produces", "glucose and oxygen", "This process produces glucose and oxygen."]] },
    negation: { statuses: ["missing", "contradicted", "missing", "missing", "missing", "missing"], claims: [[1, "Photosynthesis", "produces", "oxygen", explanations.negation, true]] },
    mixed: { statuses: ["missing", "contradicted", "missing", "missing", "correct", "missing"], claims: [[4, "Glucose", "stores", "chemical energy", explanations.short], [1, "Plants", "use", "oxygen instead of carbon dioxide", "Plants use oxygen instead of carbon dioxide during photosynthesis."]] },
    additional: { statuses: ["missing", "missing", "missing", "missing", "correct", "missing"], claims: [[4, "Glucose", "stores", "chemical energy", explanations.short]], extra: true },
    partial: { statuses: ["missing", "missing", "missing", "missing", "partial", "missing"], claims: [[4, "Glucose", "stores", "energy", explanations.partial]] },
  };
  const report = [];
  for (const [name, expected] of Object.entries(cases)) {
    const input = { ...saved.request, learner: { text: explanations[name] } };
    const claims = expected.claims.map(([index, subject, relation, object, quote, negated = false]) => ({ id: `c${index}`, topicId, subject, relation, object, quote, assertion: `${subject} ${negated ? "does not " : ""}${relation} ${object}.`, negated, conditions: [] }));
    const draft = { claims, comparisons: source.graph.statements.map((s, i) => ({ referenceRelationshipId: s.id, status: expected.statuses[i], learnerClaimIds: expected.claims.some(c => c[0] === i) ? [`c${i}`] : [], explanation: "Hand-authored expectation based on source assertion and evidence, not an AI verdict.", suggestions: [] })), additionalIdeas: [] };
    if (expected.extra) {
      draft.claims.push({ id: "extra", topicId, subject: "Some plants", relation: "have", object: "medicinal uses", quote: "Some plants also have medicinal uses.", assertion: "Some plants also have medicinal uses.", negated: false, conditions: [] });
      draft.additionalIdeas.push({ topicId, learnerClaimIds: ["extra"], explanation: "Outside the supplied source; no truth verdict." });
    }
    const result = normalizeEvaluation(input, JSON.stringify(draft));
    assert.deepEqual(result.comparisons.map(c => c.status), expected.statuses);
    assert.equal(result.additionalIdeas.length, expected.extra ? 1 : 0);
    report.push({ name, referenceIds: result.comparisons.map(c => c.referenceRelationshipId), statuses: result.comparisons.map(c => c.status), additionalIdeas: result.additionalIdeas.length });
  }
  writeFileSync(`${dir}/remaining-semantic-offline.json`, JSON.stringify({ provenance: "Hand-authored mock drafts against actual captured source IDs; no real AI grading of these inputs", report }, null, 2));
});
