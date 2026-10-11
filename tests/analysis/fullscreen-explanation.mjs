/** Exact input and real invalid fragments; synthetic candidates test preservation only. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { endpointSource, endpointDraft } from "./endpoint-fixture.mjs";
const require = createRequire(import.meta.url), load = p => require(`../../test-results/analysis-build/${p}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { normalizeEvaluation, handleEvaluationRequest, evaluationPrompt, EVALUATION_DRAFT_SCHEMA, checkLearnerParagraphCoverage } = load("backend/explanations/evaluation");
const { inspectStatement } = load("backend/contracts/statement-quality");
const { remapRepresentation } = load("backend/contracts/graph");
const { matches } = load("backend/analysis/draft");
const { planLearnerRepair, mergeLearnerRepair } = load("backend/explanations/learner-repair");
const { EXPLANATION_LIMITS } = load("backend/contracts/explanation-limits");
const text = readFileSync("tests/analysis/fixtures/reordered-math-explanation.txt", "utf8").replace(/\r\n/g, "\n");
const source = importText(endpointSource), analysis = normalizeAnalysisDraft(source, endpointDraft(source));
const input = { schemaVersion: "2.0", importedSource: source, sourceAnalysis: analysis, topicIds: analysis.graph.topics.map(t => t.id), learner: { text } };
const quote = fragment => { const sentence = text.split(/\n\n|(?<=\.) /).find(s => s.includes(fragment)); assert.ok(sentence); return sentence; };
function candidate() {
  // Focused synthetic claims within the FULL unchanged input; not an exhaustive extraction.
  const specifications = [
    ["wrong", "I think there are exactly two", ["I think", "every pair of distinct vertices"], "exactly two simple paths", "Tree", "Simple paths"],
    ["modal", "I am not sure whether", ["I am not sure whether", "single fixed integer y", "every integer x"], undefined, "Integer y", "Integer x"],
    ["not", "Its contrapositive is", [], "NOT q implies NOT p", "Contrapositive", "NOT q implies NOT p"],
    ["outside", "Antisymmetry means", ["even when a and b are the same element"], undefined, "Antisymmetry", "aRb and bRa"],
    ["degree", "The degree of a vertex", [], undefined, "Vertex degree", "Incident edges"],
    ["and", "A conjunction requires", [], undefined, "Conjunction", "Both operands true"],
    ["union", "the union contains", [], undefined, "Union", "Elements in either set"],
    ["function", "A function assigns", ["exactly one output to each input"], undefined, "Function", "Input and output"],
    ["forall", "a universal statement", ["every element"], undefined, "Universal statement", "Domain elements"],
  ];
  const concepts = specifications.flatMap(([id, , , , subject, object]) => [{ id: `${id}-s`, name: subject, aliases: [] }, { id: `${id}-o`, name: object, aliases: [] }]);
  const claims = specifications.map(([id, fragment, conditions, formula]) => ({ id, assertion: quote(fragment), quote: quote(fragment), conditions, negated: false,
    ...(formula ? { formula } : {}), representation: { kind: "complex", participants: [{ conceptId: `${id}-s`, role: "subject" }, { conceptId: `${id}-o`, role: "scoped predicate" }] } }));
  return { concepts, claims, comparisons: analysis.graph.statements.map(s => ({ referenceRelationshipId: s.id, status: "missing", learnerClaimIds: [], explanation: "Synthetic transport test: unrelated biology source, not a math verdict.", suggestions: [] })),
    additionalIdeas: claims.map(c => ({ learnerClaimIds: [c.id], explanation: "Outside this synthetic biology lesson, not automatically incorrect." })) };
}
test("full exact input is submitted without heading/order requirements, truncation or source filtering", () => {
  assert.equal(text.length, 2601); assert.equal(text.split("\n\n").length, 9);
  const prompt = JSON.parse(evaluationPrompt(input)); assert.equal(prompt.learnerText, text);
  assert.equal(Object.keys(prompt)[0], "learnerText");
  assert.deepEqual(new Set(prompt.source.relationships.map(s => s.id)), new Set(analysis.graph.statements.map(s => s.id)));
});
test("shared remapping preserves duplicate participant roles, binary direction and original representations", () => {
  for (const r of [{ kind: "binary", subjectConceptId: "a", relation: "stores", objectConceptId: "b" }, { kind: "complex", participants: [{ conceptId: "a", role: "input" }, { conceptId: "a", role: "bound variable" }, { conceptId: "b", role: "output" }] }]) {
    const snapshot = structuredClone(r), mapped = remapRepresentation(r, id => `normalized-${id}`);
    assert.deepEqual(r, snapshot);
    if (mapped.kind === "binary") assert.deepEqual(mapped, { ...r, subjectConceptId: "normalized-a", objectConceptId: "normalized-b" });
    else assert.deepEqual(mapped.participants, r.participants.map(p => ({ ...p, conceptId: `normalized-${p.conceptId}` })));
  }
});
test("normalization preserves formula, wrong claims, epistemic uncertainty, every/even-if scope and verbatim evidence", () => {
  const raw = candidate(), result = normalizeEvaluation(input, JSON.stringify(raw));
  for (const [i, claim] of raw.claims.entries()) {
    const s = result.learnerGraph.statements[i];
    assert.equal(s.assertion, claim.assertion); assert.equal(s.negated, false);
    assert.deepEqual(s.conditions, claim.conditions); assert.equal(s.formula, claim.formula);
    const e = result.learnerGraph.evidence.find(e => e.id === s.evidenceIds[0]);
    assert.equal(e.quote, claim.quote); assert.equal(text.slice(e.location.charRange.start, e.location.charRange.end), e.quote);
  }
  assert.equal(result.additionalIdeas.length, 9);
  assert.ok(result.comparisons.every(c => c.status === "missing" && c.learnerStatements.length === 0));
});
test("paragraph omission is a concrete error; headings and short unpunctuated text do not create a minimum input length", () => {
  const d = candidate(); assert.doesNotThrow(() => checkLearnerParagraphCoverage(text, d));
  d.claims = d.claims.filter(c => c.id !== "modal");
  assert.throws(() => checkLearnerParagraphCoverage(text, d), e => e.issues.some(i => i.path === "$.learnerParagraphs[7]"));
  assert.doesNotThrow(() => checkLearnerParagraphCoverage("## Heading\n\nGlucose stores energy", { claims: [] }));
});
test("real generation-1 faulty endpoints/self-loops originate in draft, remain hard errors (no redirect/type conversion)", () => {
  const capture = JSON.parse(readFileSync("tests/analysis/fixtures/reordered-math-invalid-draft.json", "utf8"));
  for (const c of capture.claims) {
    const issues = inspectStatement(c, capture.concepts, `$.claims[${c.id}]`);
    assert.ok(issues.some(i => i.severity === "error" && i.path.endsWith("objectConceptId")), c.id);
  }
});
test("real generation-2 empty additional item is rejected; no silently dropping required data", () => {
  const d = candidate(); d.additionalIdeas = [{ learnerClaimIds: [], explanation: "" }];
  assert.equal(matches(d, EVALUATION_DRAFT_SCHEMA), false);
  assert.throws(() => normalizeEvaluation(input, JSON.stringify(d)), e => e.issues.some(i => i.path === "$.additionalIdeas[0].learnerClaimIds"));
});
test("real generation 4 STOP still omitted both quantifier paragraphs; completeness guard blocks success", () => {
  const capture = JSON.parse(readFileSync("tests/analysis/fixtures/reordered-math-invalid-draft.json", "utf8"));
  assert.throws(() => checkLearnerParagraphCoverage(text, { claims: capture.generation4ClaimQuotes }), e => {
    assert.deepEqual(e.issues.map(i => i.path), ["$.learnerParagraphs[6]", "$.learnerParagraphs[7]"]); return true;
  });
});
test("evaluation output budget covers observed truncation without increasing audio output or adding retry", async () => {
  let calls = 0;
  const response = await handleEvaluationRequest(new Request("http://local/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }), { async generate(r) {
    calls++; assert.equal(r.maxOutputTokens, 16384); assert.equal(JSON.parse(r.prompt).learnerText, text);
    return { text: JSON.stringify(candidate()), finishReason: "stop" };
  } });
  assert.equal(response.status, 200); assert.equal(calls, 1); assert.equal(EXPLANATION_LIMITS.outputTokens, 8192);
});
function brokenFunction() {
  const d = candidate(), c = d.claims.find(c => c.id === "function");
  c.representation = { kind: "binary", subjectConceptId: "function-s", relation: "assigns", objectConceptId: "function-s" };
  const patch = { concepts: [{ id: "actual-input", name: "Input", aliases: [] }, { id: "actual-output", name: "Output", aliases: [] }],
    claims: [{ id: "function", representation: { kind: "complex", participants: [{ conceptId: "function-s", role: "assigning function" }, { conceptId: "actual-input", role: "each input" }, { conceptId: "actual-output", role: "exactly one output" }] } }] };
  let issues; try { normalizeEvaluation(input, JSON.stringify(d)); } catch (e) { issues = e.issues; }
  assert.ok(issues); const plan = planLearnerRepair(d, issues); assert.ok(plan);
  return { d, patch, plan };
}
test("one scoped representation patch preserves ALL assertions, wrong knowledge, modal scope, evidence and comparison IDs", async () => {
  const { d, patch, plan } = brokenFunction(), merged = mergeLearnerRepair(JSON.stringify(patch), plan);
  assert.deepEqual(merged.comparisons, d.comparisons); assert.deepEqual(merged.additionalIdeas, d.additionalIdeas);
  for (const [i, c] of d.claims.entries()) {
    const { representation, ...frozen } = c, { representation: r, ...after } = merged.claims[i]; assert.deepEqual(after, frozen);
    if (c.id !== "function") assert.deepEqual(r, representation);
  }
  let calls = 0;
  const response = await handleEvaluationRequest(new Request("http://local/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }), { async generate(r) {
    calls++;
    if (calls === 2) { const prompt = JSON.parse(r.prompt); assert.equal(prompt.learnerText, text); assert.deepEqual(prompt.claims.map(c => c.id), ["function"]); assert.equal(prompt.source, undefined); }
    return { text: JSON.stringify(calls === 1 ? d : patch), finishReason: "stop" };
  } });
  assert.equal(response.status, 200); assert.equal(calls, 2);
});
test("repair cannot drop claims, overwrite good claims/concepts, change quotes/assertions or bypass full validation", async () => {
  const { d, patch, plan } = brokenFunction();
  for (const mutate of [p => p.claims = [], p => p.claims[0].id = "modal", p => p.concepts[0].id = "function-s", p => p.claims[0].assertion = "corrected", p => p.claims[0].quote = "fabricated"]) {
    const p = structuredClone(patch); mutate(p); assert.throws(() => mergeLearnerRepair(JSON.stringify(p), plan));
  }
  assert.equal(planLearnerRepair(d, [{ path: "$.comparisons[0]", code: "invariant", message: "Bad comparison" }]), undefined);
  assert.equal(planLearnerRepair(d, [{ path: "$.learnerParagraphs[7]", code: "invariant", message: "Omitted paragraph" }]), undefined);
  let calls = 0;
  const response = await handleEvaluationRequest(new Request("http://local/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }), { async generate() {
    calls++; return { text: JSON.stringify(calls === 1 ? d : { concepts: [], claims: [{ id: "function", representation: d.claims.find(c => c.id === "function").representation }] }), finishReason: "stop" };
  } });
  assert.equal(response.status, 502); assert.equal(calls, 2);
});
test("unchanged complete real response can be replayed without making a generation", t => {
  const file = "test-results/fullscreen-explanation/accepted-response.json";
  if (!existsSync(file)) return t.skip("No accepted private real response yet.");
  const { validateEvaluateTextResponse } = load("backend/contracts/validate");
  const live = JSON.parse(readFileSync("test-results/fullscreen-explanation/input.json", "utf8"));
  const response = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(validateEvaluateTextResponse(live, response.body).valid, true);
});
