import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { topicSource, partDraft } from "./topic-processing-fixture.mjs";
const require = createRequire(import.meta.url), load = f => require(`../../test-results/analysis-build/${f}.js`);
const { importText } = load("backend/sources/ingest");
const { planSourceParts } = load("backend/analysis/sections");
const { validateSectionRequest, analyzeNextPart, mergePartDrafts, namespacePart, SectionFailure } = load("backend/analysis/section-pipeline");
const { handleAnalysisRequest } = load("backend/analysis/handler");
const { validateEvaluationInput } = load("backend/explanations/evaluation");
const { validateImportedAnalysisResponse } = load("backend/contracts/validate");
const { AnalysisError } = load("backend/analysis/errors");
const { ANALYSIS_DRAFT_SCHEMA } = load("backend/analysis/draft");
const source = () => importText(topicSource);
const input = (importedSource, completedParts = [], callsUsed = 0) => ({ schemaVersion: "2.0", importedSource, processing: { completedParts, callsUsed } });
const provider = seen => ({ async generate(r) { seen.push(JSON.parse(r.prompt)); return { text: JSON.stringify(partDraft(r)), finishReason: "stop" }; } });

test("headings form semantic topics; every unchanged block occurs once and paragraphs are not topics", () => {
  const s = source(), parts = planSourceParts(s);
  assert.equal(new Set(parts.flatMap(p => p.topics.map(t => t.id))).size, 5);
  assert.deepEqual(parts.flatMap(p => p.blockIds), s.document.blocks.map(b => b.id));
  const noHeadings = importText(Array(24).fill("Sensor transmits signals. ".repeat(15)).join("\n\n"));
  const technical = planSourceParts(noHeadings);
  assert.ok(technical.length > 1); assert.equal(new Set(technical.map(p => p.topicId)).size, 1);
  assert.ok(technical.length < noHeadings.document.blocks.length);
});

test("sequential extraction merges stable reference IDs, canonical concepts and exact source evidence; evaluation accepts it", async () => {
  const importedSource = source(), completed = [], seen = [], checkpoints = [];
  let callsUsed = 0, analysis;
  const plan = planSourceParts(importedSource);
  for (let i = 0; i < plan.length; i++) {
    const result = await analyzeNextPart(validateSectionRequest(input(importedSource, completed, callsUsed)), provider(seen));
    callsUsed = result.callsUsed;
    if (result.data.kind === "part_complete") { completed.push(result.data.part); checkpoints.push(structuredClone(completed)); }
    else analysis = result.data;
  }
  assert.equal(callsUsed, plan.length); assert.equal(seen.length, plan.length);
  assert.equal(plan.length, 3);
  for (const [i, request] of seen.entries()) assert.deepEqual(request.sourceData.blocks.map(b => b.id), plan[i].blockIds);
  assert.deepEqual(analysis.document, importedSource.document);
  assert.equal(analysis.graph.topics.length, 5);
  assert.equal(analysis.graph.concepts.filter(c => c.name === "Photosynthesis").length, 1);
  assert.equal(new Set(analysis.graph.statements.map(s => s.id)).size, analysis.graph.statements.length);
  assert.equal(validateImportedAnalysisResponse({ schemaVersion: "2.0", importedSource }, { ok: true, schemaVersion: "2.0", data: analysis }).valid, true);
  assert.ok(validateEvaluationInput({ schemaVersion: "2.0", importedSource, sourceAnalysis: analysis, topicIds: analysis.graph.topics.map(t => t.id), learner: { text: "Water loses electrons." } }));
  for (const t of analysis.graph.topics) { assert.ok(analysis.graph.statements.some(s => s.topicId === t.id)); assert.ok(analysis.lessonSections.find(l => l.topicId === t.id).summary); }
  for (const e of analysis.graph.evidence) { const b = importedSource.document.blocks.find(b => b.id === e.blockId); assert.equal(b.text.slice(e.location.charRange.start, e.location.charRange.end), e.quote); }
  mkdirSync("test-results/topic-processing", { recursive: true });
  writeFileSync("test-results/topic-processing/offline.json", JSON.stringify({ provenance: "Synthetic provider through real split/merge; NOT live AI", importedSource, analysis, checkpoints, seen }, null, 2));
});

test("part schema narrows topic IDs/titles without imposing enums on assertions, concept names or quotes", async () => {
  const importedSource = source();
  await analyzeNextPart(validateSectionRequest(input(importedSource)), { async generate(r) {
    const p = r.schema.properties;
    assert.deepEqual(p.topics.items.properties.id.enum, ["section-1", "section-2", "section-3"]);
    assert.deepEqual(p.topics.items.properties.title.enum, ["Source overview", "The process", "Chlorophyll"]);
    assert.equal(p.statements.items.properties.assertion.enum, undefined);
    assert.equal(p.statements.items.properties.id.enum, undefined);
    assert.equal(p.statements.items.properties.evidence.items.properties.quote.enum, undefined);
    assert.equal(p.concepts.items.properties.name.enum, undefined);
    assert.equal(ANALYSIS_DRAFT_SCHEMA.properties.topics.items.properties.id.enum, undefined);
    return { text: JSON.stringify(partDraft(r)), finishReason: "stop" };
  } });
});

test("failed part does not retry provider failures or discard previous success; manual retry calls only the unfinished part", async () => {
  const importedSource = source(), seen = [];
  const first = await analyzeNextPart(validateSectionRequest(input(importedSource)), provider(seen));
  const completed = [first.data.part], before = structuredClone(completed);
  let failed;
  try { await analyzeNextPart(validateSectionRequest(input(importedSource, completed, 1)), { async generate() { throw new AnalysisError("UPSTREAM_UNAVAILABLE", 503, "Provider unavailable.", true); } }); }
  catch (e) { failed = e; }
  assert.ok(failed instanceof SectionFailure); assert.equal(failed.callsUsed, 2); assert.deepEqual(completed, before);
  const result = await analyzeNextPart(validateSectionRequest(input(importedSource, completed, 2)), provider(seen));
  assert.equal(result.data.part.partId, "part-2"); assert.equal(result.callsUsed, 3);
  assert.equal(seen.length, 2); assert.equal(mergePartDrafts(completed).statements[0].id, before[0].draft.statements[0].id);
});

test("oversized plans and malformed checkpoints fail before provider configuration", async () => {
  const many = importText(Array.from({ length: 7 }, (_, i) => `# Section ${i}\n\n${"Sensor transmits signals. ".repeat(90)}`).join("\n\n"));
  for (const body of [input(many), { ...input(source()), processing: { completedParts: [{ partId: "bad", calls: 1, draft: {} }], callsUsed: 1 } }]) {
    let configured = 0;
    const response = await handleAnalysisRequest(new Request("http://localhost/api/analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), () => { configured++; return provider([]); });
    assert.ok(response.status >= 400); assert.equal(configured, 0);
  }
});

test("resume rejects forged evidence, topic IDs, changed concept meaning, wrong source and hidden extra fields", async () => {
  const s = source(), first = await analyzeNextPart(validateSectionRequest(input(s)), provider([]));
  for (const mutate of [
    p => p.draft.statements[0].evidence[0].quote = "Invented quote",
    p => p.draft.topics[0].id = "wrong",
    p => p.draft.blockDispositions[0].blockId = "foreign",
    p => p.sourceHash = "0".repeat(64),
    p => p.extra = "hidden",
  ]) {
    const part = structuredClone(first.data.part); mutate(part);
    assert.throws(() => validateSectionRequest(input(s, [part], 1)));
  }
  const seen = [], second = await analyzeNextPart(validateSectionRequest(input(s, [first.data.part], 1)), provider(seen));
  const part = structuredClone(second.data.part), known = first.data.part.draft.concepts.find(c => c.name === "Photosynthesis");
  part.draft.concepts.push({ ...known, name: "Different meaning" });
  assert.throws(() => validateSectionRequest(input(s, [first.data.part, part], 2)));
});

test("explicit canonical reuse keeps established aliases; omitted/new suggestions never redefine the catalog", async () => {
  const s = source(), first = await analyzeNextPart(validateSectionRequest(input(s)), provider([]));
  const catalog = first.data.part.draft.concepts, known = catalog[0], part = planSourceParts(s)[1];
  const draft = structuredClone(first.data.part.draft);
  draft.concepts[0].aliases = ["Unverified suggested alias"];
  const mapped = namespacePart(draft, part, catalog);
  assert.deepEqual(mapped.concepts.find(c => c.id === known.id), known);
  assert.ok(!catalog.some(c => c.aliases.includes("Unverified suggested alias")));
  draft.concepts[0] = { ...known, id: "distinct-local-id" };
  draft.statements = []; draft.lessonSections = [];
  const distinct = namespacePart(draft, part, catalog);
  assert.notEqual(distinct.concepts[0].id, known.id);
});

test("multiple technical parts of one topic retain one topic and bounded merged lessons", async () => {
  const s = importText("# Sensors\n\n" + Array(16).fill("Sensor transmits signals. ".repeat(18)).join("\n\n"));
  const plan = planSourceParts(s); assert.ok(plan.length > 1);
  let completed = [], callsUsed = 0, analysis;
  for (const _ of plan) {
    const r = await analyzeNextPart(validateSectionRequest(input(s, completed, callsUsed)), provider([]));
    callsUsed = r.callsUsed;
    if (r.data.kind === "part_complete") completed.push(r.data.part); else analysis = r.data;
  }
  assert.equal(analysis.graph.topics.length, 1); assert.ok(analysis.lessonSections[0].keyPoints.length <= 20);
  assert.deepEqual(analysis.document, s.document);
});

test("one technical part can retain three semantic topics, not collapse them into one chunk-topic", async () => {
  const s = importText(topicSource.split("**Light-dependent")[0].trimEnd());
  const plan = planSourceParts(s); assert.equal(plan.length, 1); assert.equal(plan[0].topics.length, 3);
  const result = await analyzeNextPart(validateSectionRequest(input(s)), provider([]));
  assert.equal(result.data.graph.topics.length, 3);
  writeFileSync("test-results/topic-processing/compact.json", JSON.stringify({ importedSource: s, analysis: result.data, provenance: "Synthetic one-part, three-topic fixture" }, null, 2));
});
