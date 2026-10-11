/** Offline mocks establish transport/render preservation, not AI semantic success. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { representationSource, representationDraft, nonBiologySource, nonBiologyDraft } from "./representation-quality-fixture.mjs";
const require = createRequire(import.meta.url);
const load = file => require(`../../test-results/analysis-build/${file}.js`);
const { importText } = load("backend/sources/ingest");
const { parseDraft } = load("backend/analysis/draft");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { analyzeImportedSource } = load("backend/analysis/pipeline");
const { validateSourceAnalysis, validateEvaluateTextRequest } = load("backend/contracts/validate");
const { evaluationPrompt } = load("backend/explanations/evaluation");
const { toReferenceFlow } = load("lib/reference-graph");
const names = (analysis, r) => r.participants.map(p => ({ role: p.role, name: analysis.graph.concepts.find(c => c.id === p.conceptId).name }));

function checkPreservation(draft, analysis) {
  assert.equal(validateSourceAnalysis(analysis).valid, true);
  for (const original of draft.statements) {
    const normalized = analysis.graph.statements.find(s => s.assertion === original.assertion);
    assert.ok(normalized); assert.equal(normalized.representation.kind, original.representation.kind);
    assert.deepEqual(normalized.conditions, original.conditions); assert.equal(normalized.negated, original.negated);
    const conceptName = id => draft.concepts.find(c => c.id === id).name;
    if (original.representation.kind === "complex") assert.deepEqual(names(analysis, normalized.representation),
      original.representation.participants.map(p => ({ role: p.role, name: conceptName(p.conceptId) })));
    else {
      const r = normalized.representation, edge = toReferenceFlow(analysis.graph, normalized.topicId).edges.find(e => e.id === normalized.id);
      assert.equal(analysis.graph.concepts.find(c => c.id === r.subjectConceptId).name, conceptName(original.representation.subjectConceptId));
      assert.equal(analysis.graph.concepts.find(c => c.id === r.objectConceptId).name, conceptName(original.representation.objectConceptId));
      assert.equal(edge.source, `${analysis.graph.id}:${r.subjectConceptId}`); assert.equal(edge.target, `${analysis.graph.id}:${r.objectConceptId}`);
      assert.equal(r.relation, original.representation.relation);
    }
  }
  for (const e of analysis.graph.evidence) {
    const b = analysis.document.blocks.find(b => b.id === e.blockId);
    assert.equal(b.text.slice(e.location.charRange.start, e.location.charRange.end), e.quote);
  }
}

for (const [name, text, build] of [["biology", representationSource, representationDraft], ["non-biology", nonBiologySource, nonBiologyDraft]]) {
  test(`synthetic ${name}: participants, binary endpoints, conditions and lesson/evaluation IDs survive the actual pipeline`, async () => {
    const importedSource = importText(text), draft = build(importedSource), before = structuredClone(draft);
    let calls = 0;
    const analysis = await analyzeImportedSource({ schemaVersion: "2.0", importedSource }, { async generate() {
      calls++; return { text: JSON.stringify(draft), finishReason: "stop" };
    } });
    assert.equal(calls, 1); assert.deepEqual(draft, before); assert.deepEqual(analysis.document, importedSource.document);
    checkPreservation(draft, analysis);
    const request = { schemaVersion: "2.0", importedSource, sourceAnalysis: analysis, topicIds: analysis.graph.topics.map(t => t.id), learner: { text: "A short explanation." } };
    assert.equal(validateEvaluateTextRequest(request).valid, true);
    const sent = JSON.parse(evaluationPrompt(request)).source.relationships;
    for (const s of analysis.graph.statements) {
      assert.ok(sent.some(p => p.id === s.id && p.assertion === s.assertion));
      assert.ok(analysis.lessonSections.some(l => l.statementIds.includes(s.id)));
    }
    const multi = analysis.graph.statements.filter(s => s.representation.kind === "complex" && s.representation.participants.filter(p => p.role === "agent").length > 1);
    assert.ok(multi.length);
    for (const s of multi) {
      assert.equal(s.representation.participants.filter(p => p.role === "agent").length, 3);
      assert.ok(s.conditions.some(c => /some/i.test(c)));
      const flow = toReferenceFlow(analysis.graph, s.topicId);
      for (const p of s.representation.participants) assert.ok(flow.nodes.some(n => n.id === `${analysis.graph.id}:${p.conceptId}`));
      assert.ok(!flow.edges.some(e => e.id === s.id)); // Role connections are not invented binary claims.
      assert.equal(flow.edges.filter(e => e.data.referenceStatementId === s.id).length, s.representation.participants.length);
      assert.ok(flow.nodes.some(n => n.data.referenceStatementId === s.id));
    }
    if (name === "biology") {
      for (const phrase of ["Water loses electrons", "Carbon dioxide gains electrons", "Plants take in water", "Plants take in carbon dioxide"]) {
        const s = analysis.graph.statements.find(s => s.assertion.startsWith(phrase));
        assert.equal(s.representation.kind, "binary"); assert.ok(s.conditions.includes("During photosynthesis"));
        if (phrase.includes("electrons")) assert.ok(s.conditions.includes("Within the plant cell"));
      }
      assert.ok(analysis.graph.statements.find(s => s.assertion.startsWith("Most life")).conditions.includes("Most life on Earth"));
      const energy = multi.find(s => s.assertion.includes("stored in glucose"));
      assert.ok(names(analysis, energy.representation).some(p => p.name === "Glucose" && p.role === "storage carrier"));
      const joint = analysis.graph.statements.find(s => s.assertion.includes("from the air and soil"));
      assert.equal(joint.representation.kind, "complex");
      assert.ok(joint.conditions.some(c => c.includes("does not specify")));
      assert.ok(!analysis.graph.statements.filter(s => s.assertion.startsWith("Plants take in")).some(s => /air|soil/.test(s.assertion)));
    } else {
      const negative = analysis.graph.statements.find(s => s.negated);
      assert.match(toReferenceFlow(analysis.graph, negative.topicId).edges.find(e => e.id === negative.id).label, /^not transmit.*When disabled/);
      const independent = analysis.graph.statements.filter(s => s.assertion.startsWith("Pump supplies"));
      assert.ok(independent.every(s => s.representation.kind === "binary" && s.conditions.includes("When enabled")));
      assert.equal(new Set(independent.map(s => s.representation.objectConceptId)).size, 2);
      assert.equal(new Set(independent.flatMap(s => s.evidenceIds)).size, 1);
    }
    mkdirSync("test-results/representation-quality-v2", { recursive: true });
    writeFileSync(`test-results/representation-quality-v2/${name}.json`, JSON.stringify({ provenance: "Synthetic draft through actual pipeline, NOT live AI", importedSource, draft, analysis }, null, 2));
  });
}

test("incomplete synthetic AI draft stays incomplete: no assertion scan invents roles or silently converts complex", () => {
  const importedSource = importText(representationSource), draft = representationDraft(importedSource);
  const capture = draft.statements.find(s => s.id === "capture");
  for (const s of draft.statements.filter(s => s.id === "capture" || s.id === "capture-energy")) {
    s.representation.participants = s.representation.participants.filter(p => !["algae", "bacteria"].includes(p.conceptId));
  }
  const analysis = normalizeAnalysisDraft(importedSource, parseDraft(JSON.stringify(draft)));
  const normalized = analysis.graph.statements.find(s => s.assertion === capture.assertion);
  assert.equal(normalized.representation.kind, "complex");
  assert.deepEqual(names(analysis, normalized.representation), [{ role: "agent", name: "Plants" }, { role: "input", name: "Sunlight" }, { role: "output", name: "Oxygen" }]);
  assert.ok(analysis.analysisWarnings.some(w => w.statementId === normalized.id && w.code === "EXTRACTION_REVIEW"));
});
