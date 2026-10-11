// Explicit node:test entrypoint; does not match Playwright's *.spec/*.test discovery.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { syntheticDemo, demoAnalyzeRequest, demoEvaluateRequest, demoAnalyzeResponse, demoEvaluateResponse } = require("../../test-results/analysis-build/backend/contracts/synthetic-demo.js");
const { validateDemo, validateSourceAnalysis, validateEvaluationResult, validateAnalyzeSourceRequest, validateEvaluateTextRequest, validateAnalyzeSourceResponse, validateEvaluateTextResponse } = require("../../test-results/analysis-build/backend/contracts/validate.js");

const fresh = () => structuredClone(syntheticDemo);
const accepted = result => assert.equal(result.valid, true, JSON.stringify(result.issues));
const rejected = (result, code, pathFragment) => {
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(i => i.code === code && i.path.includes(pathFragment)), JSON.stringify(result.issues));
};

test("synthetic round trip, all five statuses, additional idea and exact evidence", () => {
  const demo = JSON.parse(JSON.stringify(syntheticDemo));
  accepted(validateDemo(demo));
  accepted(validateSourceAnalysis(demo.sourceAnalysis));
  accepted(validateEvaluationResult(demo.sourceAnalysis, demo.evaluation));
  assert.deepEqual(demo.evaluation.comparisons.map(c => c.status).sort(),
    ["correct", "partial", "contradicted", "missing", "uncertain"].sort());
  assert.equal(demo.evaluation.additionalIdeas.length, 1);
  assert.equal("status" in demo.evaluation.additionalIdeas[0], false);
  assert.equal("position" in demo.sourceAnalysis.graph.concepts[0], false);
});

test("text analyze, PDF multipart metadata, stateless evaluation request", () => {
  accepted(validateAnalyzeSourceRequest(demoAnalyzeRequest));
  accepted(validateAnalyzeSourceRequest({ schemaVersion: "2.0", source: { kind: "pdf", title: "Lecture" } }));
  accepted(validateEvaluateTextRequest(demoEvaluateRequest));
  rejected(validateEvaluateTextRequest({ schemaVersion: "2.0", sourceAnalysisId: "demo-analysis", topicIds: ["photosynthesis"], learner: { text: "Explanation" } }), "shape", "sourceAnalysis");
  rejected(validateAnalyzeSourceRequest({ schemaVersion: "2.0", source: { kind: "text", text: "  " } }), "shape", "text");
  rejected(validateAnalyzeSourceRequest({ schemaVersion: "2.0", source: { kind: "audio", text: "Input" } }), "shape", "kind");
  rejected(validateAnalyzeSourceRequest({ schemaVersion: "1.0", source: { kind: "text", text: "Input" } }), "shape", "schemaVersion");
});

test("IDs may repeat across graphs; references disambiguate the graph", () => {
  assert.equal(syntheticDemo.sourceAnalysis.graph.statements[0].id, syntheticDemo.evaluation.learnerGraph.statements[0].id);
  accepted(validateDemo(syntheticDemo));
});

test("successful API envelopes bind outputs to the input source and learner text", () => {
  accepted(validateAnalyzeSourceResponse(demoAnalyzeRequest, demoAnalyzeResponse));
  accepted(validateEvaluateTextResponse(demoEvaluateRequest, demoEvaluateResponse));
  const analyze = structuredClone(demoAnalyzeResponse);
  analyze.data.document.kind = "pdf";
  rejected(validateAnalyzeSourceResponse(demoAnalyzeRequest, analyze), "invariant", "document.kind");
  const evaluate = structuredClone(demoEvaluateResponse);
  evaluate.data.learnerDocument.blocks[0].text += " Different text.";
  rejected(validateEvaluateTextResponse(demoEvaluateRequest, evaluate), "invariant", "learnerDocument.blocks");
});

test("API error envelope is explicit and rejects extra success fields", () => {
  const error = { ok: false, schemaVersion: "2.0", error: { code: "INVALID_REQUEST", message: "Invalid payload", retryable: false, details: [{ path: "$.learner.text", message: "Required" }] } };
  accepted(validateAnalyzeSourceResponse(demoAnalyzeRequest, error));
  accepted(validateEvaluateTextResponse(demoEvaluateRequest, error));
  rejected(validateEvaluateTextResponse(demoEvaluateRequest, { ...error, data: syntheticDemo.evaluation }), "shape", "data");
  rejected(validateEvaluateTextResponse(demoEvaluateRequest, { ok: true, schemaVersion: "2.0" }), "shape", "data");
  rejected(validateEvaluateTextResponse(demoEvaluateRequest, { ...error, error: { ...error.error, code: "UNKNOWN" } }), "shape", "code");
});

test("missing and uncertain allow an empty learner reference array", () => {
  const demo = fresh();
  assert.deepEqual(demo.evaluation.comparisons.find(c => c.status === "missing").learnerStatements, []);
  const uncertain = demo.evaluation.comparisons.find(c => c.status === "uncertain");
  uncertain.learnerStatements = [];
  demo.evaluation.learnerGraph.statements = demo.evaluation.learnerGraph.statements.filter(s => s.id !== "powers");
  demo.evaluation.learnerGraph.evidence = demo.evaluation.learnerGraph.evidence.filter(e => e.id !== "e-powers");
  accepted(validateDemo(demo));
});

test("completely unmatched nonempty text yields missing without fabricated learner statements", () => {
  const demo = fresh();
  demo.learnerText = "I am unsure.";
  demo.evaluation.learnerDocument.blocks[0].text = demo.learnerText;
  demo.evaluation.learnerGraph.concepts = [];
  demo.evaluation.learnerGraph.statements = [];
  demo.evaluation.learnerGraph.evidence = [];
  demo.evaluation.additionalIdeas = [];
  demo.evaluation.comparisons.forEach(c => { c.status = "missing"; c.learnerStatements = []; });
  accepted(validateDemo(demo));
});

test("parallel edges between the same concept pair are allowed", () => {
  const demo = fresh();
  const extra = structuredClone(demo.sourceAnalysis.graph.statements[0]);
  extra.id = "absorbs-parallel";
  extra.role = "fact";
  demo.sourceAnalysis.graph.statements.push(extra);
  demo.evaluation.comparisons.push({ ...structuredClone(demo.evaluation.comparisons[0]), id: "compare-parallel", referenceRelationshipId: extra.id, sourceStatements: [{ graphId: "source-graph", statementId: extra.id }] });
  accepted(validateDemo(demo));
});

test("one learner claim may match several references, several claims may match one", () => {
  const demo = fresh();
  demo.evaluation.comparisons[1].learnerStatements.push(...demo.evaluation.comparisons[0].learnerStatements);
  accepted(validateDemo(demo));
});

function withSecondSourceTopic() {
  const demo = fresh();
  const source = demo.sourceAnalysis;
  source.graph.topics.push({ id: "other", title: "A separate topic" });
  source.graph.concepts.push(
    { id: "other-subject", documentId: "source-document", name: "Chlorophyll", aliases: [] },
    { id: "other-object", documentId: "source-document", name: "Light energy", aliases: [] },
  );
  source.graph.statements.push({ ...structuredClone(source.graph.statements[0]), id: "other-absorbs", topicId: "other", representation: { ...source.graph.statements[0].representation, subjectConceptId: "other-subject", objectConceptId: "other-object" } });
  source.lessonSections.push({ id: "other-section", topicId: "other", summary: "Chlorophyll absorbs light energy.", statementIds: ["other-absorbs"], keyPoints: [{ id: "point", text: "Chlorophyll absorbs light energy.", statementIds: ["other-absorbs"] }] });
  return demo;
}

test("unselected source topics are not marked missing", () => {
  const demo = withSecondSourceTopic();
  accepted(validateDemo(demo));
  const request = { ...structuredClone(demoEvaluateRequest), sourceAnalysis: demo.sourceAnalysis };
  accepted(validateEvaluateTextResponse(request, { ok: true, schemaVersion: "2.0", data: demo.evaluation }));
  request.topicIds = ["other"];
  rejected(validateEvaluateTextResponse(request, { ok: true, schemaVersion: "2.0", data: demo.evaluation }), "invariant", "topicIds");
  demo.evaluation.comparisons[0].sourceStatements = [{ graphId: "source-graph", statementId: "other-absorbs" }];
  rejected(validateDemo(demo), "invariant", "sourceStatements");
});

test("learner topics can use local IDs different from source topics", () => {
  const demo = fresh();
  demo.evaluation.learnerGraph.topics[0].id = "learner-local-topic";
  demo.evaluation.learnerGraph.statements.forEach(s => { s.topicId = "learner-local-topic"; });
  accepted(validateDemo(demo));
});

test("PDF page locations are allowed when real metadata agrees", () => {
  const demo = fresh();
  demo.sourceAnalysis.document.kind = "pdf";
  demo.sourceAnalysis.document.blocks[0].location = { page: 2 };
  demo.sourceAnalysis.graph.evidence.forEach(e => { e.location.page = 2; });
  accepted(validateDemo(demo));
});

test("PDF page metadata can be absent; unverified quotes retain source text without a unique occurrence", () => {
  const demo = fresh();
  demo.sourceAnalysis.document.kind = "pdf";
  const e = demo.sourceAnalysis.graph.evidence[0];
  e.verification = "unverified";
  // Ambiguous/unverified quotes still have to occur in the source.
  delete e.location;
  demo.evaluation.comparisons[0].status = "uncertain";
  accepted(validateDemo(demo));
});

test("UTF-16 evidence ranges handle non-ASCII/surrogate pairs", () => {
  const demo = fresh();
  const block = demo.sourceAnalysis.document.blocks[0];
  block.text = `🌱 Leaves. ${block.text}`;
  const shift = "🌱 Leaves. ".length;
  demo.sourceAnalysis.graph.evidence.forEach(e => { e.location.charRange.start += shift; e.location.charRange.end += shift; });
  accepted(validateDemo(demo));
});

const invalidCases = [
  ["duplicate concept ID", d => d.sourceAnalysis.graph.concepts.push(structuredClone(d.sourceAnalysis.graph.concepts[0])), "invariant", "concepts"],
  ["duplicate block ID", d => d.sourceAnalysis.document.blocks.push(structuredClone(d.sourceAnalysis.document.blocks[0])), "invariant", "blocks"],
  ["duplicate statement ID", d => d.sourceAnalysis.graph.statements.push(structuredClone(d.sourceAnalysis.graph.statements[0])), "invariant", "statements"],
  ["duplicate evidence ID", d => d.sourceAnalysis.graph.evidence.push(structuredClone(d.sourceAnalysis.graph.evidence[0])), "invariant", "evidence"],
  ["unknown topic", d => { d.sourceAnalysis.graph.statements[0].topicId = "unknown"; }, "reference", "topicId"],
  ["unknown subject", d => { d.sourceAnalysis.graph.statements[0].representation.subjectConceptId = "unknown"; }, "reference", "subjectConceptId"],
  ["unknown object", d => { d.sourceAnalysis.graph.statements[0].representation.objectConceptId = "unknown"; }, "reference", "objectConceptId"],
  ["unknown statement evidence", d => { d.sourceAnalysis.graph.statements[0].evidenceIds = ["unknown"]; }, "reference", "evidenceIds"],
  ["cross-document concept", d => { d.sourceAnalysis.graph.concepts[1].documentId = "other"; }, "reference", "documentId"],
  ["cross-topic summary", d => { d.sourceAnalysis.graph.topics.push({ id: "other", title: "Other" }); d.sourceAnalysis.lessonSections[0].topicId = "other"; }, "invariant", "statementIds"],
  ["unknown lesson statement", d => { d.sourceAnalysis.lessonSections[0].keyPoints[0].statementIds = ["unknown"]; }, "reference", "keyPoints"],
  ["missing topic section", d => d.sourceAnalysis.graph.topics.push({ id: "other", title: "Other" }), "invariant", "lessonSections"],
  ["unknown evidence block", d => { d.sourceAnalysis.graph.evidence[0].blockId = "unknown"; }, "reference", "blockId"],
  ["wrong evidence document", d => { d.sourceAnalysis.graph.evidence[0].documentId = "learner-document"; }, "reference", "documentId"],
  ["wrong graph document", d => { d.sourceAnalysis.graph.documentId = "wrong"; }, "reference", "documentId"],
  ["wrong block document", d => { d.sourceAnalysis.document.blocks[0].documentId = "wrong"; }, "reference", "documentId"],
  ["wrong quote kind", d => { d.sourceAnalysis.graph.evidence[0].kind = "learner_quote"; }, "invariant", "kind"],
  ["fabricated verified quote", d => { d.sourceAnalysis.graph.evidence[0].quote = "Not present"; }, "evidence", "quote"],
  ["definite verdict without verified source evidence", d => { d.sourceAnalysis.graph.evidence[0].verification = "unverified"; }, "evidence", "sourceStatements"],
  ["definite verdict without verified learner evidence", d => { d.evaluation.learnerGraph.evidence[0].verification = "unverified"; }, "evidence", "learnerStatements"],
  ["wrong character range", d => { d.sourceAnalysis.graph.evidence[0].location.charRange.start = 1; }, "evidence", "quote"],
  ["out of bounds range", d => { d.sourceAnalysis.graph.evidence[0].location.charRange.end = 9999; }, "evidence", "charRange"],
  ["reversed range", d => { d.sourceAnalysis.graph.evidence[0].location.charRange.start = 100; }, "evidence", "charRange"],
  ["negative offset", d => { d.sourceAnalysis.graph.evidence[0].location.charRange.start = -1; }, "shape", "start"],
  ["fabricated text block page", d => { d.sourceAnalysis.document.blocks[0].location = { page: 1 }; }, "invariant", "page"],
  ["fabricated text evidence page", d => { d.sourceAnalysis.graph.evidence[0].location.page = 1; }, "evidence", "page"],
  ["mismatched PDF page", d => { d.sourceAnalysis.document.kind = "pdf"; d.sourceAnalysis.document.blocks[0].location = { page: 2 }; d.sourceAnalysis.graph.evidence[0].location.page = 3; }, "evidence", "page"],
  ["zero page", d => { d.sourceAnalysis.document.blocks[0].location = { page: 0 }; }, "shape", "page"],
  ["source topic with source mapping", d => { d.sourceAnalysis.graph.topics[0].sourceTopicId = "photosynthesis"; }, "shape", "sourceTopicId"],
  ["learner mapping to nonexistent topic", d => { d.evaluation.learnerGraph.topics[0].sourceTopicId = "unknown"; }, "shape", "sourceTopicId"],
  ["wrong statement graph reference", d => { d.evaluation.comparisons[0].learnerStatements[0].graphId = "source-graph"; }, "reference", "graphId"],
  ["unknown comparison statement", d => { d.evaluation.comparisons[0].sourceStatements[0].statementId = "unknown"; }, "reference", "statementId"],
  ["wrong source analysis", d => { d.evaluation.sourceAnalysisId = "unknown"; }, "reference", "sourceAnalysisId"],
  ["colliding graph IDs", d => { d.evaluation.learnerGraph.id = "source-graph"; }, "invariant", "learnerGraph"],
  ["unknown requested topic", d => { d.evaluation.topicIds = ["unknown"]; }, "reference", "topicIds"],
  ["duplicate requested topic", d => d.evaluation.topicIds.push("photosynthesis"), "invariant", "topicIds"],
  ["missing with learner match", d => { d.evaluation.comparisons[3].learnerStatements = [{ graphId: "learner-graph", statementId: "absorbs" }]; }, "invariant", "learnerStatements"],
  ["correct without learner match", d => { d.evaluation.comparisons[0].learnerStatements = []; }, "invariant", "learnerStatements"],
  ["unclassified source statement", d => d.evaluation.comparisons.pop(), "invariant", "comparisons"],
  ["unclassified learner addition", d => { d.evaluation.additionalIdeas = []; }, "invariant", "learnerGraph.statements"],
  ["learner counted as comparison and addition", d => { d.evaluation.additionalIdeas[0].learnerStatements.push({ graphId: "learner-graph", statementId: "absorbs" }); }, "invariant", "additionalIdeas"],
  ["additional idea assigned correctness", d => { d.evaluation.additionalIdeas[0].status = "contradicted"; }, "shape", "status"],
  ["layout leaks into domain", d => { d.sourceAnalysis.graph.concepts[0].position = { x: 1, y: 1 }; }, "shape", "position"],
  ["unknown evaluation status", d => { d.evaluation.comparisons[0].status = "wrong"; }, "shape", "status"],
  ["non-boolean negation", d => { d.sourceAnalysis.graph.statements[0].negated = "false"; }, "shape", "negated"],
  ["formula role without formula", d => { d.sourceAnalysis.graph.statements[0].role = "formula"; }, "invariant", "formula"],
  ["mixed provenance", d => { d.evaluation.provenance = "analysis"; }, "invariant", "provenance"],
  ["learner text differs from graph document", d => { d.learnerText = "Different text"; }, "invariant", "learnerText"],
];
for (const [name, mutate, code, path] of invalidCases) {
  test(`rejects ${name}`, () => { const demo = fresh(); mutate(demo); rejected(validateDemo(demo), code, path); });
}

test("malformed JSON values fail cleanly without throwing", () => {
  for (const input of [null, false, 3, "text", [], {}, { sourceAnalysis: null }, { schemaVersion: "2.0", source: null }]) {
    assert.equal(validateDemo(input).valid, false);
    assert.equal(validateSourceAnalysis(input).valid, false);
    assert.equal(validateAnalyzeSourceRequest(input).valid, false);
    assert.equal(validateEvaluateTextRequest(input).valid, false);
    assert.equal(validateEvaluationResult(syntheticDemo.sourceAnalysis, input).valid, false);
  }
});
