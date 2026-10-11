/** Synthetic semantic examples plus an unchanged local real-draft replay when available. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const load = file => require(`../../test-results/analysis-build/${file}.js`);
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { parseDraft } = load("backend/analysis/draft");
const { planSourceParts } = load("backend/analysis/sections");
const { validateSourceAnalysis } = load("backend/contracts/validate");
const { inspectStatement } = load("backend/contracts/statement-quality");
const { ANALYSIS_SYSTEM_INSTRUCTION } = load("backend/analysis/prompt");

function example(assertion, subject, relation, object, conditions = [], negated = false) {
  const source = importText(assertion), blockId = source.document.blocks[0].id;
  const concepts = [{ id: "a", name: subject, aliases: [] }, { id: "b", name: object, aliases: [] }];
  const statement = { id: "s", topicId: "t", assertion, negated, conditions, role: "fact",
    representation: { kind: "binary", subjectConceptId: "a", relation, objectConceptId: "b" },
    evidence: [{ blockId, quote: assertion }] };
  const draft = { topics: [{ id: "t", title: "Synthetic mathematical claim" }], concepts,
    statements: [statement], blockDispositions: [{ blockId, kind: "knowledge" }],
    lessonSections: [{ topicId: "t", summary: assertion, statementIds: ["s"], keyPoints: [{ text: assertion, statementIds: ["s"] }] }] };
  return { source, draft, statement };
}
for (const [name, args] of [
  ["NOT inside an affirmed expression", ["Implication is equivalent to NOT p OR q.", "Implication", "is equivalent to", "NOT p OR q"]],
  ["parenthesized complete formula", ["NOT (p AND q) is equivalent to (NOT p) OR (NOT q).", "NOT (p AND q)", "is equivalent to", "(NOT p) OR (NOT q)"]],
  ["false truth value with exactly-when condition", ["Implication is false exactly when p is true and q is false.", "Implication", "is", "False", ["Exactly when p is true and q is false"]]],
  ["qualified denial", ["Converse is not generally equivalent to implication.", "Converse", "generally equivalent to", "Implication", ["Not generally"], true]],
  ["existential quantifier expression", ["Negated universal statement is equivalent to there exists x such that NOT P(x).", "Negated universal statement", "is equivalent to", "there exists x such that NOT P(x)"]],
  ["retained while condition", ["Sensor transmits data while enabled.", "Sensor", "transmits", "Data", ["While enabled"]]],
]) test(`valid synthetic ${name}: no rewriting of assertion, polarity or endpoints`, () => {
  const f = example(...args), before = structuredClone(f.draft);
  const result = normalizeAnalysisDraft(f.source, parseDraft(JSON.stringify(f.draft)));
  assert.deepEqual(f.draft, before);
  assert.equal(validateSourceAnalysis(result).valid, true);
  const s = result.graph.statements[0];
  assert.equal(s.assertion, f.statement.assertion);
  assert.equal(s.negated, f.statement.negated);
  assert.deepEqual(s.conditions, f.statement.conditions);
  const e = result.graph.evidence[0];
  assert.equal(result.document.blocks[0].text.slice(e.location.charRange.start, e.location.charRange.end), e.quote);
});

for (const [name, mutate] of [
  ["unrepresented while clause", f => f.statement.conditions = []],
  ["conjoined objects remain incomplete even with a while condition", f => f.statement.assertion = "Sensor transmits data and signals while enabled."],
  ["production clause remains incomplete even if copied into conditions", f => { f.statement.assertion = "Sensor transmits data to produce heat while enabled."; f.statement.conditions = ["to produce heat while enabled", "while enabled"]; }],
  ["wrong object remains invalid", f => { f.draft.concepts.push({ id: "c", name: "Signals", aliases: [] }); f.statement.representation.objectConceptId = "c"; }],
  ["wrong negated flag remains invalid", f => f.statement.negated = true],
]) test(`invalid synthetic ${name} is still blocked`, () => {
  const f = example("Sensor transmits data while enabled.", "Sensor", "transmits", "Data", ["While enabled"]);
  mutate(f);
  assert.ok(inspectStatement(f.statement, f.draft.concepts, "$.statements[0]").some(i => i.severity === "error"));
  assert.throws(() => normalizeAnalysisDraft(f.source, f.draft), e => e.code === "AI_OUTPUT_INVALID");
});

test("incomplete formula is not exempt from projection guards", () => {
  const f = example("Implication is equivalent to NOT p OR q.", "Implication", "is equivalent to", "NOT p");
  assert.throws(() => normalizeAnalysisDraft(f.source, f.draft), e => e.issues.some(i => i.path.endsWith(".representation")));
});

test("quantified joint claim stays complex with all roles, formula and evidence", () => {
  const assertion = 'Over the integers, for every x there exists y such that y > x, because y can be chosen as x + 1.';
  const f = example(assertion, "Integers", "unused", "Predicate y > x", ["Over the integers"]);
  f.statement.formula = "forall x exists y: y > x; y = x + 1";
  f.statement.representation = { kind: "complex", participants: [{ conceptId: "a", role: "domain" }, { conceptId: "b", role: "predicate" }] };
  const s = normalizeAnalysisDraft(f.source, f.draft).graph.statements[0];
  assert.equal(s.representation.kind, "complex");
  assert.deepEqual(s.representation.participants.map(p => p.role), ["domain", "predicate"]);
  assert.equal(s.formula, f.statement.formula);
  assert.equal(s.assertion, assertion);
});

test("full lesson has three semantic sections; formula introduction remains in Sets and functions", () => {
  const text = readFileSync("tests/analysis/fixtures/discrete-math-source.txt", "utf8");
  const source = importText(text), plan = planSourceParts(source);
  const topics = [...new Map(plan.flatMap(p => p.topics).map(t => [t.id, t.title])).values()];
  assert.deepEqual(topics, ["Propositional logic", "Quantifiers", "Sets and functions"]);
  assert.deepEqual(plan.flatMap(p => p.blockIds), source.document.blocks.map(b => b.id));
  const formula = source.document.blocks.find(b => b.text.includes("inclusion-exclusion"));
  assert.ok(plan.some(p => p.topics.some(t => t.title === "Sets and functions" && t.blockIds.includes(formula.id))));
  assert.ok(source.normalizedText.includes("Equal cardinalities alone"));
});

test("prompt explicitly separates heading-only blocks and mathematical polarity", () => {
  assert.match(ANALYSIS_SYSTEM_INSTRUCTION, /Standalone section headings are other/);
  assert.match(ANALYSIS_SYSTEM_INSTRUCTION, /not an operator inside a/);
  assert.match(ANALYSIS_SYSTEM_INSTRUCTION, /Do not split AND\/OR inside an expression/);
  assert.match(ANALYSIS_SYSTEM_INSTRUCTION, /A formula field/);
  assert.match(ANALYSIS_SYSTEM_INSTRUCTION, /never replace the property/);
});

test("heading coverage failure is retained; a heading with actual knowledge is not ignored", () => {
  const f = example("P implies Q.", "P", "implies", "Q");
  f.source = importText("Propositional logic\n\nP implies Q.");
  const [heading, content] = f.source.document.blocks;
  f.draft.blockDispositions = [{ blockId: heading.id, kind: "knowledge" }, { blockId: content.id, kind: "knowledge" }];
  f.statement.evidence = [{ blockId: content.id, quote: content.text }];
  assert.throws(() => normalizeAnalysisDraft(f.source, f.draft), e => e.issues.some(i => i.path === "$.blockDispositions" && i.ids.blockId === heading.id));
  f.draft.blockDispositions[0].kind = "other";
  assert.equal(normalizeAnalysisDraft(f.source, f.draft).graph.statements.length, 1);
  const mixed = example("## Definitions\nP implies Q.", "P", "implies", "Q");
  assert.equal(normalizeAnalysisDraft(mixed.source, mixed.draft).graph.statements.length, 1);
});

test("explicit Markdown headings with colons still work", () => {
  const source = importText("## Definitions:\n\nA proposition is a declarative statement that has exactly one truth value: true or false.");
  assert.equal(planSourceParts(source)[0].title, "Definitions:");
});

test("unchanged real capture: failure is heading coverage, not schema/representation", t => {
  const file = "test-results/discrete-math-analysis/before-call-1.json";
  if (!existsSync(file)) return t.skip("Private local capture is not committed.");
  const c = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(c.code, "AI_OUTPUT_INVALID");
  assert.doesNotThrow(() => parseDraft(c.outputText));
  assert.throws(() => normalizeAnalysisDraft(c.importedSource, c.draft), e => e.issues.some(i => i.path === "$.blockDispositions"));
  const corrected = structuredClone(c.draft), headings = new Set(["Propositional logic", "Quantifiers", "Sets and functions"]);
  for (const b of c.importedSource.document.blocks) if (headings.has(b.text)) corrected.blockDispositions.find(d => d.blockId === b.id).kind = "other";
  // Diagnostic variant only: does not replace the saved raw output or live responses.
  const result = normalizeAnalysisDraft(c.importedSource, corrected);
  assert.equal(result.graph.statements.length, c.draft.statements.length);
  assert.equal(validateSourceAnalysis(result).valid, true);
  writeFileSync("test-results/discrete-math-analysis/replay.json", JSON.stringify({ provenance: "Unchanged raw draft rejected; manually corrected heading dispositions isolate the cause, NOT live success", issues: c.issues, rawStatements: c.draft.statements.length, diagnosticStatements: result.graph.statements.length }, null, 2));
});

test("real scoped repair with missing lesson links is rejected, never a successful fallback", t => {
  const dir = "test-results/discrete-math-analysis";
  if (!existsSync(`${dir}/repair-output.json`)) return t.skip("Private live repair output absent.");
  const { planStatementRepair, mergeStatementRepair } = load("backend/analysis/statement-repair");
  const { request, draft, issues } = JSON.parse(readFileSync(`${dir}/merged-real-draft.json`, "utf8"));
  const output = JSON.parse(readFileSync(`${dir}/repair-output.json`, "utf8"));
  assert.equal(output.finishReason, "stop");
  const plan = planStatementRepair(draft, issues, request);
  assert.throws(() => mergeStatementRepair(output.text, plan), /cannot remove or replace an affected lesson's statement links/);
});
