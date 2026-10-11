# ExplainBack - Transcription and evaluation (Blocks 3B/3C)

Current evaluation default: [nonblocking graph output](nonblocking-output.md).
Readable learner claims are retained without quality rejection or repair; usable
comparisons keep AI verdicts. The earlier validation/repair behavior below is
historical. Transcription and input/service boundaries are unchanged.

Current graph/API contract: [v2 migration and architecture](backend-contract-v2.md).

Current product flow: [Lesson / Explanation / Compare](lesson-explanation-compare.md).
Current scoped evaluation repair: [learner references and mixed repair](learner-reference-repair.md).
The follow-up reuses the learner graph returned here, adds semantic identity
alignments and replaces the previous source-only status overlay with three views.
The verification notes below describe the historical Blocks 3B/3C implementation.


## Implemented local flow

`text/PDF/DOCX -> /api/sources -> ImportedSource -> /api/analysis -> SourceAnalysis -> learner text or audio -> editable transcript -> /api/evaluations -> feedback`.

All requests use same-origin Next.js Node.js routes (Node 22+). Source and learner
data live in React session state, not a database. Reload/reset loses the session.
No scores, accounts, attempt comparison, or implicit fixture fallback were added.
No dependency or lockfile change was needed.

## Configuration and provider

Continue using the existing server-only `GEMINI_API_KEY` and `GEMINI_MODEL`.
An optional `GEMINI_TRANSCRIPTION_MODEL` selects an explicitly configured audio
model for transcription only; otherwise transcription uses `GEMINI_MODEL`.
There is no fallback model/provider and no automatic billing change. Missing or
invalid configuration returns `AI_NOT_CONFIGURED`; text evaluation is independent
of transcription configuration. No environment file was modified in this task.

The [Gemini 3.5 Flash-Lite model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
lists audio input and structured outputs. The [official audio guide](https://ai.google.dev/gemini-api/docs/generate-content/audio)
documents transcription and WebM/WAV/M4A input. A read-only model metadata request
confirmed the configured `gemini-3.5-flash-lite` supports `generateContent`.
The existing `@google/genai` adapter sends inline audio and JSON structured output;
it removes provider-rejected array bounds while preserving local strict validation.

Each transcription/evaluation operation has exactly **one** generation, no repair
and SDK `attempts: 1`. AI deadline and SDK timeout: 60 seconds; browser deadline:
70 seconds to allow upload/validation/response overhead. Source analysis retains
its existing maximum of two generations (one bounded invalid-output repair).
Request cancellation propagates to these two new operations.

## POST /api/transcriptions

Multipart body: exactly one binary `audioFile` part. No extra fields, model override,
source text, client-supplied duration or prompt is accepted.

```ts
const body = new FormData();
body.append("audioFile", recordingFile);
fetch("/api/transcriptions", { method: "POST", body });
// Never set the multipart Content-Type yourself; the browser adds its boundary.
```

Successful response (`TranscriptionResponse`):

```json
{
  "ok": true,
  "schemaVersion": "2.0",
  "data": {
    "transcript": "Glucose does not store chemical energy.",
    "language": "en",
    "warnings": [],
    "audio": { "mimeType": "audio/wav", "bytes": 32044, "durationSeconds": 1 }
  }
}
```

The example is illustrative, not an actual one-second speech sample. Transcription
preserves audible speech in its language, including wrong assertions, negation
and conditions. It does not correct knowledge, translate, solve or summarize.
The response is editable learner input, not an evaluation. No word timestamps or
confidence scores are invented.

Shared limits are in `src/backend/contracts/explanation-limits.ts`:

| Limit | Value / enforcement |
| --- | --- |
| Audio bytes | 3,000,000; browser + streamed server validation |
| Multipart body | 3,065,536 actual bytes including headers/boundary |
| Recording duration | Browser auto-stops at 120 seconds; backend rejects known duration above 120 |
| Accepted containers | Audio-only WebM, PCM/float WAV, M4A; sniff actual headers, not extensions/MIME labels |
| Transcript | Nonempty speech, at most 10,000 UTF-16 characters |

WAV duration is computed from sample byte rate; M4A/WebM use duration metadata
when present. Streaming Chromium WebM commonly omits duration. Its unknown-size
Clusters are siblings, not nested Clusters. Unknown duration is omitted and a
warning is returned; it is not falsely reported as measured. Container inspection
is bounded structural validation, not a full audio codec decoder. Gemini still
has to decode the audio. A valid container can contain silence: an empty/intelligible
speech-free transcript is rejected with a clear message. Empty files, bad/truncated
headers, video tracks and oversized audio are rejected before any AI call.

These byte limits match source upload's existing 3 MB budget and keep multipart
requests under 3.1 MB. Base64 expansion occurs in the server-to-Gemini request,
not the incoming browser body. A deployment must support Node.js, this body size,
and at least a 60-second AI call plus overhead; hosting limits must be checked
before deployment. This task did not deploy or assume a particular hosting plan.

## POST /api/evaluations

JSON `EvaluateTextRequest`:

```ts
{
  schemaVersion: "2.0",
  importedSource, // complete validated ingestion payload
  sourceAnalysis, // complete existing analysis, unchanged IDs
  topicIds: sourceAnalysis.graph.topics.map(topic => topic.id),
  learner: { text: editableExplanationText }
}
```

The implemented endpoint requires `importedSource`; its optional TypeScript field
only preserves compatibility with Block 1's old proposed API fixtures. The imported
document, blocks, provenance and source warnings must match the analysis. JSON key
order does not matter. Input is bounded to 1,000,000 bytes, 20,000 source characters,
120 reference statements and 10,000 learner characters. No ID-only lookup, source
re-extraction or source AI regeneration occurs. PDF/DOCX learner files use the
existing `/api/sources` ingestion, then become editable text; they are never sent
as multipart evaluation data. Their extracted text must fit the learner limit.

The AI receives original source blocks, concepts, directed assertions and source
evidence alongside learner text. Instructions explicitly require checking the
assertion and endpoint meaning against evidence, using `uncertain` for a suspected
graph/evidence mismatch instead of blindly grading from the edge. This is an AI
instruction, not a deterministic proof that every semantic mismatch is detected.

Output is `ApiResponse<EvaluationResult>` using the existing domain contract:

- The source graph is not replaced. `sourceAnalysisId` points to the supplied
  analysis, and every comparison has its original `referenceRelationshipId` plus
  `sourceStatements: [{ graphId, statementId }]` pointing into that source graph.
- Block 3C returns one comparison per selected reference statement, binary or
  complex. `referenceRelationshipId` is required and must match its sole source
  reference; matching does not depend on topic order or learner claim order.
- Learner graph/document/concepts/statements/evidence receive new opaque IDs.
  Learner concepts belong to the learner document; learner topics are independent
  of source topics. Comparisons retain source topic IDs for frontend grouping.
- Source evidence is resolved through the source reference and statement's
  `evidenceIds`; learner evidence through `learnerStatements` and learner graph
  `evidenceIds`. Quotes are not duplicated into a parallel feedback schema.
- `correct` includes equivalent paraphrases; `partial` means stated but incomplete;
  `contradicted` means incompatible meaning/polarity; `missing` means not expressed
  in this explanation, not a conclusion about the learner's understanding;
  `uncertain` means insufficient support to classify.
- Missing has no learner statement/evidence. One learner claim may support multiple reference IDs, and multiple
  learner claims may support one reference. Learner topics/headings/order do not
  need to match the source. Binary and complex claims both retain real quotes.
- Additional ideas remain separate and have no automatic correctness status.

Backend validation rejects malformed JSON, extra fields, wrong IDs/topics,
incomplete reference coverage, duplicate source verdicts, claims classified both as
matched and additional, fabricated quotes and invalid ranges.
Learner quotes are located in the **exact submitted text**, with UTF-16 block-local
exclusive ranges computed by the backend. Source ranges retain their existing
coordinate system; imported original/normalized ranges are not substituted for
evidence offsets. Exact adjacent context can disambiguate repeated learner quotes.
Ambiguous occurrence has `unverified` and no invented range; its comparison becomes
`uncertain`. Verified occurrence is not proof of truth or semantic entailment.
The learner's original text, negation, conditions and mistaken assertion are preserved.

## Errors and diagnostics

Both routes return `{ ok: false, schemaVersion: "2.0", error: { code, message,
retryable } }`, `Cache-Control: no-store` and `X-Request-ID`. Existing error codes
are reused; `TRANSCRIPTION_FAILED` covers unexpected internal transcription errors.

| HTTP | Examples |
| --- | --- |
| 400 | Invalid request, no intelligible speech, missing/mismatched source data |
| 413 / 415 | Size/duration limit / unsupported audio container |
| 429 | `AI_RATE_LIMITED`; Retry-After forwarded if available |
| 502 | `AI_OUTPUT_INVALID` or `AI_OUTPUT_TRUNCATED`; no partial success/repair |
| 503 | `AI_NOT_CONFIGURED` or `UPSTREAM_UNAVAILABLE` |
| 504 | `AI_TIMEOUT` |
| 500 | `TRANSCRIPTION_FAILED`, `EVALUATION_FAILED` or upstream request-configuration rejection |

Development diagnostics use the existing ignored `.next/dev/logs/source-analysis.jsonl`
with operation stages, request ID, generation count, timing, model name, status,
finish reason, token counts and validation result. Safe quota metric/limit IDs and
retry delay are recorded for 429. Keys, prompts, full documents and audio are never
logged. Responses never expose raw provider/parser errors.

## Browser behavior and walkthrough

Run `npm run dev`, open `http://localhost:3000`:

1. Enter a source or upload PDF/DOCX and select **Continue**.
2. Review topics, source graph, summary and evidence; select **Write your explanation**.
3. Type text, or **Start recording -> Stop -> Create transcript**. Edit the text
   before **Evaluate**. Alternatively upload PDF/DOCX and select **Import explanation text**.
4. Evaluation covers all source topics. Select a topic/edge to see colored status
   **and status text**, source assertion/quote/location, learner quote and reason.
   Source summary remains source knowledge, not a status counter.
5. **Edit and try again** retains the explanation; **Back to analysis** keeps the
   source. **Start over** clears all session data and cancels in-flight operations.

Importing, transcribing and evaluating are distinct loading phases with synchronous
duplicate guards. Errors retain text/files/audio; retry uses the existing source
analysis. Editing text/file, replacing audio, changing source or resetting increments
a revision and aborts active explanation work; late responses cannot update the
new session. Microphone denial still permits text input. Only the text visible in
the editor is evaluated. An old typed explanation is retained when audio is replaced;
a new transcript replaces it only when the new transcription succeeds.

`toEvaluatedFlow` overlays status colors/labels on the original reference layout;
node/edge IDs, endpoint direction, parallel relations and backend domain data are
unchanged. The source-only view remains neutral. No fixture is used on API failure.

## Verification (2026-10-10)

Offline checks and a four-generation live smoke are separate:

- Block 1 contract suite: 64 passed.
- Analysis/graph plus explanation backend suites: 106 passed (38 new explanation
  cases); synthetic responses prove mechanics, not model grading quality.
- Desktop/mobile browser suites: 50 cases verified (48 in the final full run, then
  the two graph-render cases passed after adding an explicit edge-render wait), including stale responses, retry,
  reset, transcription edit, microphone failures and real PDF/DOCX extraction with mock AI.
- Real Chromium container capture exposed and reproduced an unknown-size WebM
  Cluster parsing bug. It was fixed with a stored synthetic speech container regression.

| Live operation | HTTP | AI calls | Approx. SDK time |
| --- | --- | --- | --- |
| Fresh source analysis on UI | 200 | 1 | 1.88 s |
| Typed explanation evaluation on UI | 200 | 1 | 2.92 s |
| Chromium WebM -> transcription | 200 | 1 | 1.24 s |
| Edited transcript -> evaluation on UI | 200 | 1 | 2.34 s |

All used configured `gemini-3.5-flash-lite`, finish reason STOP. Total: **4** generations,
no repair/retry, no quota error. An earlier transcription attempt returned local
400 before generation due to the now-fixed WebM parser. To stay within the budget,
the resumed voice browser session replayed a **previously saved real SourceAnalysis**
and ImportedSource; only its source-initialization requests were replayed. Voice
transcription and both evaluations used real endpoints/provider responses. Speech
was synthetic Windows offline TTS played through Chromium's fake microphone, not
a test of a person's physical microphone or general transcription accuracy.

The real transcript retained “Glucose does not store chemical energy.” Editing it
before submission worked. The feedback UI showed Contradicted on the original
Glucose -> stores -> Chemical energy edge with verified source and learner quotes.
This one example does not establish general semantic evaluation quality. Stored
test results/screenshots are ignored under `test-results/`; production never reads them.

Commands (offline by default):

```powershell
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/contracts/validate.mjs
node --test --test-isolation=none tests/analysis/pipeline.mjs tests/analysis/reference-graph.mjs tests/analysis/explanations.mjs
npm test -- tests/explanations.spec.ts tests/session.spec.ts --workers=1 --output=test-results/explanations-ui
npm run typecheck
npm run build
```

Live tests are opt-in and never run in the default suite. `explanations-live.spec.ts`
requires `RUN_EXPLANATION_LIVE=1` and a synthetic speech WAV at
`test-results/spoken-explanation.wav`; run desktop only with `--workers=1 --retries=0`.
The voice-only resume test requires an existing real source audit and live call
ledger; it refuses to start with more than two calls already used. Stop immediately
on 429 and inspect safe quota diagnostics; do not rerun a live suite automatically.

## Files changed in the 3B/3C task

The workspace already contained earlier uncommitted 3A/UI changes. This list is
specific to this task; those earlier changes were retained.

| Area | Files |
| --- | --- |
| Routes | src/app/api/transcriptions/route.ts; src/app/api/evaluations/route.ts |
| Contracts | src/backend/contracts/api.ts; domain.ts; validate.ts; explanation-limits.ts |
| Operations | src/backend/explanations/common.ts; audio.ts; transcription.ts; evaluation.ts |
| Existing provider | src/backend/analysis/provider.ts; gemini.ts; draft.ts; diagnostics.ts |
| Clients/state/layout | src/lib/transcription.ts; evaluation.ts; use-explanation.ts; evaluated-graph.ts |
| UI | src/components/AppShell.tsx; AudioRecorder.tsx; RecorderPreview.tsx; TranscriptEditor.tsx; UnderstandingMap.tsx; SourceEvidenceDetails.tsx; StatusBadge.tsx; ExplanationFeedback.tsx; src/app/globals.css |
| Tests | tests/analysis/explanations.mjs; tsconfig.json; fixtures/chromium-synthetic-speech.webm; fixtures/README.md; tests/explanations.spec.ts; session.spec.ts; explanations-live.spec.ts; voice-live.spec.ts; audio-container.spec.ts |
| Documentation | README.md; docs/backend-contract-v1.md; source-analysis.md; ui-source-analysis.md; source-explanations.md |

Typecheck and production build passed. The pre-existing next-env.d.ts content was
preserved byte-for-byte (SHA-256 B8B3A344484B959AF5E4E3FC1A1609DAC3CB9ECE0CDEB6C145BE29BC4C491000).
No package/lockfile change, key exposure, environment-file edit, commit, push,
merge or deployment was performed.
