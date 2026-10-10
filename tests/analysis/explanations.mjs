/** Offline, hand-authored outputs test transport/validation; not model accuracy. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { endpointSource, endpointDraft } from "./endpoint-fixture.mjs";
const require = createRequire(import.meta.url);
const { importText } = require("../../test-results/analysis-build/backend/sources/ingest.js");
const { normalizeAnalysisDraft } = require("../../test-results/analysis-build/backend/analysis/normalize.js");
const { normalizeEvaluation, validateEvaluationInput, handleEvaluationRequest, evaluationPrompt } = require("../../test-results/analysis-build/backend/explanations/evaluation.js");
const { handleTranscriptionRequest } = require("../../test-results/analysis-build/backend/explanations/transcription.js");
const { inspectAudio } = require("../../test-results/analysis-build/backend/explanations/audio.js");
const { createGeminiProvider } = require("../../test-results/analysis-build/backend/analysis/gemini.js");
const { AnalysisError } = require("../../test-results/analysis-build/backend/analysis/errors.js");
const { toEvaluatedFlow } = require("../../test-results/analysis-build/lib/evaluated-graph.js");
const { toReferenceFlow } = require("../../test-results/analysis-build/lib/reference-graph.js");
const importedSource = importText(endpointSource);
const sourceAnalysis = normalizeAnalysisDraft(importedSource, endpointDraft(importedSource));
const topicId = sourceAnalysis.graph.topics[0].id;
const input = learner => ({ schemaVersion: "1.0", importedSource, sourceAnalysis, topicIds: [topicId], learner: { text: learner } });
export function wav(seconds = 1, sampleRate = 16000) {
  const b = Buffer.alloc(44 + Math.round(seconds * sampleRate) * 2);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(b.length - 44, 40);
  return b;
}
const provider = value => ({ calls: 0, async generate(request) { this.calls++; this.request = request; if (value instanceof Error) throw value; return { text: JSON.stringify(value), finishReason: "stop" }; } });
const multipart = (bytes = wav(), field = "audioFile") => { const form = new FormData(); form.append(field, new Blob([bytes], { type: "audio/webm" }), "misleading.webm"); return new Request("http://local/api/transcriptions", { method: "POST", body: form }); };
const jsonRequest = value => new Request("http://local/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
const claim = (quote, overrides = {}) => ({ id: "c1", topicId, subject: "Photosynthesis", relation: "produces", object: "Glucose", assertion: quote, negated: false, conditions: [], quote, ...overrides });
function draft(status, claims = []) {
  return { claims, comparisons: sourceAnalysis.graph.statements.map((s, i) => ({ referenceRelationshipId: s.id, status: i === 0 ? status : "missing", learnerClaimIds: i === 0 ? claims.map(c => c.id) : [], explanation: "Hand-authored offline explanation.", suggestions: [] })), additionalIdeas: [] };
}

test("audio sniffs WAV bytes, not uploaded MIME/file name, and measures duration", () => {
  assert.deepEqual(inspectAudio(wav()), { mimeType: "audio/wav", bytes: 32044, durationSeconds: 1 });
});
test("real Chromium container: unknown-size Clusters remain siblings across many recording chunks", () => {
  // Windows offline TTS -> Chromium MediaRecorder, not user speech or AI output.
  const recording = readFileSync(new URL("./fixtures/chromium-synthetic-speech.webm", import.meta.url));
  const cluster = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
  const first = recording.indexOf(cluster), second = recording.indexOf(cluster, first + 4);
  assert.ok(first > 0 && second > first);
  const longRecording = Buffer.concat([recording.subarray(0, first), ...Array.from({ length: 20 }, () => recording.subarray(first, second))]);
  assert.equal(inspectAudio(longRecording).mimeType, "audio/webm");
  assert.equal(inspectAudio(recording).durationSeconds, undefined);
  assert.throws(() => inspectAudio(recording.subarray(0, second + 50)), e => e.code === "INVALID_REQUEST");
});
for (const [name, bytes, code] of [["empty", Buffer.alloc(0), "INVALID_REQUEST"], ["fake WebM", Buffer.from("no audio"), "UNSUPPORTED_SOURCE"], ["truncated WAV", wav().subarray(0, 60), "INVALID_REQUEST"], ["duration limit", wav(121, 8000), "PAYLOAD_TOO_LARGE"], ["byte limit", Buffer.alloc(3000001), "PAYLOAD_TOO_LARGE"]]) {
  test(`audio rejects ${name} before AI`, () => assert.throws(() => inspectAudio(bytes), e => e.code === code));
}
test("M4A structural metadata checks duration, malformed boxes and video tracks", () => {
  const box = (name, data) => { const out = Buffer.alloc(8 + data.length); out.writeUInt32BE(out.length); out.write(name, 4); data.copy(out, 8); return out; };
  const recording = (duration, type = "soun") => {
    const mvhd = Buffer.alloc(20); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(duration * 1000, 16);
    const hdlr = Buffer.alloc(12); hdlr.write(type, 8);
    return Buffer.concat([box("ftyp", Buffer.from("M4A \x00\x00\x00\x00isom")), box("moov", Buffer.concat([box("mvhd", mvhd), box("trak", box("mdia", box("hdlr", hdlr)))])), box("mdat", Buffer.from([1, 2, 3]))]);
  };
  assert.equal(inspectAudio(recording(5)).durationSeconds, 5); assert.equal(inspectAudio(recording(5)).mimeType, "audio/m4a");
  assert.throws(() => inspectAudio(recording(121)), e => e.code === "PAYLOAD_TOO_LARGE");
  assert.throws(() => inspectAudio(recording(5, "vide")), e => e.code === "UNSUPPORTED_SOURCE");
  assert.throws(() => inspectAudio(recording(5).subarray(0, 35)), e => e.code === "INVALID_REQUEST");
});
test("evaluation input binding ignores JSON key order and rejects lost source warnings", () => {
  const body = structuredClone(input("Example."));
  body.importedSource.document = Object.fromEntries(Object.entries(body.importedSource.document).reverse());
  assert.doesNotThrow(() => validateEvaluationInput(body));
  delete body.sourceAnalysis.sourceWarnings;
  assert.throws(() => validateEvaluationInput(body), e => e.code === "INVALID_REQUEST");
});
test("transcription preserves learner misconception and uses audioFile with inline audio", async () => {
  const p = provider({ transcript: "Glucose does not store chemical energy.", language: "en", warnings: [] });
  const response = await handleTranscriptionRequest(multipart(), p);
  assert.equal(response.status, 200); assert.equal(p.calls, 1);
  assert.match(p.request.systemInstruction, /Never correct knowledge/);
  assert.equal(p.request.audio.mimeType, "audio/wav"); assert.equal(Buffer.from(p.request.audio.data, "base64").length, wav().length);
  assert.equal((await response.json()).data.transcript, "Glucose does not store chemical energy.");
});
test("wrong audio field is rejected without generation", async () => { const p = provider({}); assert.equal((await handleTranscriptionRequest(multipart(wav(), "file"), p)).status, 400); assert.equal(p.calls, 0); });
for (const [name, value, status] of [["silence", { transcript: "", language: "und", warnings: [] }, 400], ["unexpected fields", { transcript: "OK", language: "en", warnings: [], corrected: true }, 502], ["quota", new AnalysisError("AI_RATE_LIMITED", 429, "Quota reached.", true, 30), 429], ["timeout", new AnalysisError("AI_TIMEOUT", 504, "Timeout.", true), 504]]) {
  test(`transcription handles ${name} with one call and no repair`, async () => { const p = provider(value); const r = await handleTranscriptionRequest(multipart(), p); assert.equal(r.status, status); assert.equal(p.calls, 1); if (status === 429) assert.equal(r.headers.get("retry-after"), "30"); });
}
for (const [name, status, text, negated] of [["correct", "correct", "Photosynthesis produces glucose.", false], ["correct paraphrase", "correct", "The process makes sugar.", false], ["partial", "partial", "Photosynthesis makes a product.", false], ["contradiction/negation", "contradicted", "Photosynthesis does not produce glucose.", true], ["uncertain", "uncertain", "It might make something.", false]]) {
  test(`evaluation accepts ${name} and keeps source IDs and actual learner range`, () => {
    const result = normalizeEvaluation(input(text), JSON.stringify(draft(status, [claim(text, { negated })])));
    assert.equal(result.comparisons[0].status, status); assert.equal(result.learnerGraph.statements[0].negated, negated);
    assert.equal(result.comparisons[0].referenceRelationshipId, sourceAnalysis.graph.statements[0].id);
    assert.deepEqual(result.learnerGraph.evidence[0].location.charRange, { start: 0, end: text.length });
    assert.equal(result.sourceAnalysisId, sourceAnalysis.id);
  });
}
test("missing has no learner statements or fabricated quote", () => {
  const result = normalizeEvaluation(input("I am unsure."), JSON.stringify(draft("missing")));
  assert.deepEqual(result.learnerGraph.evidence, []); assert.ok(result.comparisons.every(c => c.status === "missing" && c.learnerStatements.length === 0));
});
test("additional idea is stored separately without incorrect status", () => {
  const text = "Plants look beautiful."; const d = draft("missing", []); d.claims = [claim(text)]; d.additionalIdeas = [{ topicId, learnerClaimIds: ["c1"], explanation: "Not addressed by the source." }];
  const result = normalizeEvaluation(input(text), JSON.stringify(d)); assert.equal(result.additionalIdeas.length, 1); assert.equal(result.additionalIdeas[0].status, undefined);
});
test("ambiguous repeated quote becomes uncertain without invented range", () => {
  const text = "Sugar is made. Sugar is made.";
  const result = normalizeEvaluation(input(text), JSON.stringify(draft("correct", [claim("Sugar is made.")])));
  assert.equal(result.comparisons[0].status, "uncertain"); assert.equal(result.learnerGraph.evidence[0].location, undefined);
});
test("quote context disambiguates occurrences and preserves UTF-16 offsets", () => {
  const text = "🌱 Sugar is made. Sugar is made.";
  const result = normalizeEvaluation(input(text), JSON.stringify(draft("correct", [claim("Sugar is made.", { contextBefore: "🌱 " })])));
  assert.equal(result.comparisons[0].status, "correct"); assert.equal(result.learnerGraph.evidence[0].location.charRange.start, 3);
});
for (const [name, change] of [["fabricated quote", d => d.claims[0].quote = "invented"], ["unknown reference", d => d.comparisons[0].referenceRelationshipId = "wrong"], ["wrong topic", d => d.claims[0].topicId = "wrong"], ["duplicate claim", d => d.claims.push(d.claims[0])], ["missing with learner quote", d => d.comparisons[0].status = "missing"], ["uncovered source relationship", d => d.comparisons.pop()], ["unknown learner claim", d => d.comparisons[0].learnerClaimIds = ["unknown"]], ["unknown additional field", d => d.score = 100], ["claim double counted", d => d.additionalIdeas = [{ topicId, learnerClaimIds: ["c1"], explanation: "extra" }]]]) {
  test(`evaluation rejects ${name}`, () => { const text = "Photosynthesis produces glucose."; const d = draft("correct", [claim(text)]); change(d); assert.throws(() => normalizeEvaluation(input(text), JSON.stringify(d)), e => e.code === "AI_OUTPUT_INVALID"); });
}
test("evaluation preserves conditions and erroneous claims rather than correcting them", () => {
  const text = "Photosynthesis does not produce glucose unless it is dark.";
  const result = normalizeEvaluation(input(text), JSON.stringify(draft("contradicted", [claim(text, { negated: true, conditions: ["unless it is dark"] })])));
  assert.equal(result.learnerGraph.statements[0].assertion, text); assert.deepEqual(result.learnerGraph.statements[0].conditions, ["unless it is dark"]);
});
test("endpoint requires full matching ingestion and never reanalyses source", async () => {
  const text = "Photosynthesis produces glucose.", body = input(text), p = provider(draft("correct", [claim(text)]));
  assert.equal((await handleEvaluationRequest(jsonRequest(body), p)).status, 200); assert.equal(p.calls, 1);
  assert.match(p.request.systemInstruction, /not general knowledge or word overlap/); assert.match(p.request.systemInstruction, /endpoints disagree/);
  assert.equal(JSON.parse(evaluationPrompt(body)).source.relationships[0].id, sourceAnalysis.graph.statements[0].id);
  const noSource = { ...body }; delete noSource.importedSource; assert.throws(() => validateEvaluationInput(noSource));
  const mismatch = structuredClone(body); mismatch.importedSource.document.id = "wrong"; assert.throws(() => validateEvaluationInput(mismatch));
});
test("evaluation truncation and provider failures never trigger repair/retry", async () => {
  for (const result of [new AnalysisError("UPSTREAM_UNAVAILABLE", 503, "Unavailable.", true), { text: "{}", finishReason: "truncated" }]) {
    const p = { calls: 0, async generate() { this.calls++; if (result instanceof Error) throw result; return result; } };
    const r = await handleEvaluationRequest(jsonRequest(input("Example.")), p); assert.equal(p.calls, 1); assert.ok([502, 503].includes(r.status));
  }
});
test("evaluation graph adapter changes colors/text only, retaining every source edge endpoint", () => {
  const result = normalizeEvaluation(input("Example."), JSON.stringify(draft("missing")));
  const original = toReferenceFlow(sourceAnalysis.graph, topicId), adapted = toEvaluatedFlow(sourceAnalysis.graph, topicId, result);
  assert.deepEqual(adapted.nodes, original.nodes); assert.deepEqual(adapted.edges.map(e => [e.id, e.source, e.target, e.data]), original.edges.map(e => [e.id, e.source, e.target, e.data])); assert.ok(adapted.edges.every(e => e.label.startsWith("Missing:")));
});
test("Gemini audio transport sends structured inline data with exactly one SDK attempt", async () => {
  let calls = 0, sent;
  const p = createGeminiProvider({ GEMINI_API_KEY: "synthetic-test-key", GEMINI_MODEL: "synthetic-test-model" }, async (_url, options) => { calls++; sent = JSON.parse(options.body); return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"transcript":"OK"}' }] } }] }); });
  await p.generate({ prompt: "Transcribe.", systemInstruction: "Verbatim.", schema: { type: "object", properties: { transcript: { type: "string" } }, required: ["transcript"], additionalProperties: false }, audio: { mimeType: "audio/wav", data: "AA==" }, maxOutputTokens: 100, signal: new AbortController().signal });
  assert.equal(calls, 1); assert.equal(sent.contents[0].parts[1].inlineData.mimeType, "audio/wav"); assert.equal(sent.generationConfig.responseMimeType, "application/json");
});
