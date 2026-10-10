# ExplainBack - Source analysis (Block 3A)

## Scope and end-to-end contract

The intended learning flow is:

`text/PDF/DOCX -> POST /api/sources -> ImportedSource -> POST /api/analysis -> SourceAnalysis -> learner text/transcript -> future POST /api/evaluations -> EvaluationResult`.

Only source analysis is implemented here. `/api/transcriptions` and
`/api/evaluations` remain absent, and no endpoint returns fake success. UI,
microphone behavior, React Flow layout, database and authentication are unchanged.

The server has no session storage. Keep the complete **ImportedSource** and
**SourceAnalysis** separately in frontend state. A document or analysis ID cannot
reload either object. ImportedSource retains originalSegments, extraction metadata
and warnings. SourceAnalysis retains the exact imported document/blocks and copies
warnings into `sourceWarnings`; it adds topics, reference knowledge and lessons.
`provenance: analysis` means the analysis operation ran, not that every assertion
is independently scientifically verified. Optional `analysisWarnings` carries
block-scoped repeated-quote and question/exercise caveats. Legacy Block 1 fixtures
remain `synthetic_demo`, and all existing contract fields remain compatible.

## POST /api/analysis

Node.js route, synchronous JSON operation, no file upload at this stage.

```ts
// First call /api/sources using its existing JSON/multipart contract.
const request: AnalyzeImportedSourceRequest = {
  schemaVersion: "1.0",
  importedSource: importResponse.data, // complete ImportedSource, never just an ID
  outputLanguage: "source", // optional: source (default), en, vi
};
```

Unknown request fields, inconsistent ranges/references/metadata, invalid versions
and unsupported languages fail before provider configuration or network access.
Raw text, PDF bytes, multipart, local paths and URLs are not analysis inputs.

HTTP 200 uses `ApiResponse<SourceAnalysis>`:

```ts
{
  ok: true,
  schemaVersion: "1.0",
  data: {
    schemaVersion: "1.0",
    id: /* backend-generated analysis UUID */,
    provenance: "analysis",
    document: /* unchanged importedSource.document */,
    graph: {
      id: /* graph UUID */, documentId: /* same document ID */, kind: "source",
      topics: /* topic IDs and titles */,
      concepts: /* topic-local names, aliases and optional symbols */,
      statements: /* atomic directed assertions, polarity, conditions and evidence IDs */,
      evidence: /* original quotes, block IDs, verification and optional block-local offsets */
    },
    lessonSections: /* one summary/key-point section per topic, linked to statement IDs */,
    sourceWarnings: /* exact importedSource.warnings */,
    analysisWarnings: /* block-scoped AMBIGUOUS_EVIDENCE / QUESTIONS_PRESENT */
  }
}
```

This is an annotated structure, not literal JSON. Types are in
`src/backend/contracts/{api,domain}.ts`; executable mock examples are in
`tests/analysis/pipeline.mjs`. Responses, including errors, use Cache-Control no-store.

English/Vietnamese selection applies to generated content, not quotes or adjacent
source context. The prompt requests the source language when omitted; language
adherence is semantic model behavior, not guaranteed by the runtime validator.

## Provider and model configuration

The official `@google/genai` SDK (installed version 2.28.0) is a production dependency.
It supplies Gemini transport, structured JSON output and cancellation rather than
introducing an application-specific HTTP SDK. No Zod/schema dependency is needed:
the draft JSON schema is shared with its local runtime shape validator.

Set **GEMINI_API_KEY** and **GEMINI_MODEL** on the backend. Neither has a default;
missing values return AI_NOT_CONFIGURED. `.env.example` contains empty placeholders.
Do not expose credentials through NEXT_PUBLIC variables or commit `.env.local`.
This change does not read/print or modify `.env.local` during setup.

Official documentation checked on 2026-10-10:

- [Structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
  describes supported models, the JSON Schema subset and the need for semantic validation.
- [Models](https://ai.google.dev/gemini-api/docs/models) lists current IDs.
- [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) lists shutdowns.
- [SDK configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html)
  describes structured output and abort behavior.

The checked docs list `gemini-3.8-flash` as an active structured-output model.
That is a configuration example, not a selected application default or a live-tested
recommendation. Confirm availability for your account before configuring it.
The installed SDK's generateContent types support responseMimeType and
responseJsonSchema; this adapter uses those fields. Current REST documentation also
shows responseFormat. An offline SDK transport test verifies the actual request
produced by this installed version. SDK HTTP retries are explicitly disabled
(`attempts: 1`); the pipeline owns the total call budget.

No tools, grounding, search, code execution, file upload, billing setup or purchase
is invoked. The provider is imported only by the backend route/pipeline area.

## Limits and retries

Constants: `src/backend/analysis/limits.ts`.

| Limit | Value |
| --- | --- |
| Actual JSON request bytes | 1,000,000 |
| Original/extracted and normalized source | 20,000 UTF-16 code units each |
| Source blocks | 120; each still respects ingestion's 2,000-character limit |
| Output topics / concepts / statements | 12 / 100 / 120 |
| Evidence per statement / key points per topic | 4 / 20 |
| Parsed model JSON | 100,000 UTF-16 code units |
| Model output token ceiling per call | 8,192, including applicable model accounting |
| AI calls per request | 2 maximum, including initial call and any repair/retry |
| Per-call / total AI time | 25,000 / 52,000 ms |
| Retry delay | 250 ms |

There is no batching. A valid Block 2 source may exceed Block 3A's supported scope;
return 413 without silently truncating it. Input/collection size ceilings are not
token guarantees. A model can still reach its output-token limit; MAX_TOKENS fails
without returning a partial graph. A second call cannot exceed the same output cap.

One regeneration is allowed for malformed JSON, shape/reference/evidence/lesson-link
errors. Repair sends the complete original block payload plus a controlled error
label, never a raw SDK diagnostic or the previous untrusted output. Only exact
structured concept/statement duplicates are remapped; there is no fuzzy name merging.
Knowledge blocks must have an extracted supporting statement. Every input block
must be accounted for, though this does not prove every semantic claim was extracted.

A temporary upstream/network failure may have one retry. Missing/rejected config,
rate-limit, timeout, blocked output, truncated output and a valid no-knowledge result
are not automatically retried. Error.retryable indicates whether a later user retry
may help, not that the backend will retry now. Cancellation bounds local waiting;
Google notes that abort does not cancel service processing or applicable charges.
The limits apply per request; there is no global rate limiter/authentication in this scope.

## Evidence, IDs and question boundaries

The backend creates graph/entity/section IDs and remaps every reference. Imported
document/block IDs and contents are never regenerated, rewritten or repaired.
Each graph collection has locally unique IDs; cross-graph statement references
remain `{ graphId, statementId }` for future evaluation.

AI supplies only `blockId`, verbatim `quote`, and optional exact contextBefore/After.
Offsets and verification values supplied by AI are rejected. Backend searches the
referenced block and computes UTF-16 `[start,end)` offsets. One matching occurrence
is verified. Multiple matches without unique adjacent context remain **unverified**
and have no arbitrary range; a warning names the block. Missing quotes/context fail
the analysis and can trigger one repair. Quote occurrence does not prove entailment.

Coordinate systems stay distinct:

- `block.original.charRange`: range in the referenced original segment.
- `block.normalizedRange`: range in ImportedSource.normalizedText.
- `Evidence.location.charRange`: range in that block's text.

The imported normalizedText is built from normalized segments, not from joining split
blocks. Original segments remain in the separately retained ImportedSource. Text/DOCX
have no invented PDF pages; evidence copies real PDF page locations when present.

The prompt treats document content as untrusted data, asks for explicit source-backed
knowledge only, preserves negation/conditions, and forbids solving exercises, correcting
source answers, adding outside knowledge or guessing lost equation formatting.
Every block has a model disposition (knowledge/questions/mixed/other). Question-only
dispositions cannot supply assertion evidence. A conservative lexical guard also rejects
blocks/quotes consisting entirely of sentences ending in question marks. Valid
question/exercise-only extraction returns NO_EXTRACTABLE_KNOWLEDGE, not an empty success.

These checks do not prove the model's semantic classification, atomicity, aliases,
summary faithfulness or entailment. Question identification beyond the lexical guard
depends on the model. Prompt-injection resistance is a boundary and testable packaging
choice, not a security guarantee. Formula-format loss in extraction and the previously
reported copied-response offset concern are not claimed fixed by this block; tests use
original structured objects, not terminal copies. OCR/layout recovery is unchanged.

## Errors

All use `{ ok: false, schemaVersion: "1.0", error: { code, message, retryable } }`.
Messages are controlled: no secret, source text, prompt or SDK stack is logged/returned.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | INVALID_REQUEST | Invalid or inconsistent ImportedSource/request |
| 413 | PAYLOAD_TOO_LARGE | Request/input exceeds supported scope |
| 415 | UNSUPPORTED_SOURCE | Request is not JSON |
| 422 | NO_EXTRACTABLE_KNOWLEDGE | Questions/exercises/no explicit knowledge |
| 422 | ANALYSIS_FAILED | Provider blocked or did not finish usable output |
| 429 | AI_RATE_LIMITED | Provider quota/rate limit; try later |
| 503 | AI_NOT_CONFIGURED | Missing or rejected credentials/model/schema configuration |
| 503 | UPSTREAM_UNAVAILABLE | Temporary provider/network failure after bounded retry |
| 504 | AI_TIMEOUT | Per-call or total deadline exceeded |
| 502 | AI_OUTPUT_INVALID | Invalid output after the repair budget |
| 502 | AI_OUTPUT_TRUNCATED | Provider reached output limit |
| 500 | ANALYSIS_FAILED | Unexpected local failure |

## Local verification from PowerShell

Requires Node 22+ (native TypeScript Block 1 tests were verified with Node 24.13.1).

```powershell
node --test --test-isolation=none tests/contracts/validate.mjs
node node_modules/typescript/bin/tsc -p tests/sources/tsconfig.json
node --test --test-isolation=none tests/sources/ingest.mjs
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/analysis/pipeline.mjs
npm run typecheck -- --incremental false
npm run build
```

For HTTP tests, use a local server without Gemini config so it cannot incur AI charges:

```powershell
npm run start -- --hostname 127.0.0.1 --port 3100
# Another terminal:
node --test --test-isolation=none tests/sources/http.mjs
node --test --test-isolation=none tests/analysis/http.mjs
```

`SOURCE_API_BASE_URL` overrides the HTTP test URL. Provider mock tests never use
the network; SDK tests use an injected offline transport. They prove mechanics and
contract behavior, not Gemini's semantic accuracy. Compile outputs/cache are ignored.

For an actual local request, configure Gemini server environment, start `npm run dev`,
then import and analyze in another PowerShell terminal:

```powershell
$request = @{ schemaVersion = "1.0"; source = @{ kind = "text"; text = "Glucose stores chemical energy. Chlorophyll absorbs light energy." } } | ConvertTo-Json -Depth 5
$source = Invoke-RestMethod "http://localhost:3000/api/sources" -Method Post -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($request))
$request = @{ schemaVersion = "1.0"; importedSource = $source.data; outputLanguage = "en" } | ConvertTo-Json -Depth 30
$analysis = Invoke-RestMethod "http://localhost:3000/api/analysis" -Method Post -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($request))
$analysis.data.graph
$analysis.data.lessonSections
$analysis.data.sourceWarnings
$analysis.data.analysisWarnings
```

Alternatively, after compiling, explicitly opt in to a small live provider smoke test
(up to two calls). Configure GEMINI_API_KEY/GEMINI_MODEL in that terminal without
printing them, then run:

```powershell
$env:RUN_GEMINI_SMOKE = "1"
node tests/analysis/live.mjs
```

The direct smoke script reads process environment, not .env.local. Next.js reads local
environment files when starting its server. Restart after changing configuration.
Without valid config no live smoke is claimed; no billing is activated by setup.

### Verification recorded on 2026-10-10

- Block 1 contract tests: 64 passed.
- Block 2 ingestion tests: 47 passed; production HTTP tests: 10 passed.
- Block 3A mock/offline SDK tests: 50 passed; production HTTP tests: 5 passed.
- Both dedicated test compilation steps, project typecheck and production build passed.
- Live Gemini smoke test skipped because GEMINI_API_KEY/GEMINI_MODEL were absent.
  These results do not establish real-model semantic accuracy.
- The pre-existing next-env.d.ts change was preserved byte-for-byte after build.

## Frontend handoff and subsequent endpoints

The teammate owning UI should call /api/sources, store its complete result, then
call /api/analysis and retain both results across steps. Clear stale analysis when
source changes, preserve input on errors, display source/analysis warnings, topics,
summaries and evidence. Filter domain concepts/statements by topic and calculate
React Flow positions in a frontend adapter. Source graph edges have no learner
evaluation status. Do not map source analysis into the old Relationship shape by
inventing correct/missing badges. The existing results view remains fixture-based.

Proposed contracts for later blocks, not additional implemented schemas:

- `/api/transcriptions`: retain multipart `audioFile`, return
  `ApiResponse<{ transcript: string }>` so its text can feed the existing learner
  text contract. The current client already accepts data.transcript but needs
  error-envelope alignment. Audio limits/provider/format support remain to be agreed.
- `/api/evaluations`: reuse **EvaluateTextRequest** (schemaVersion, full SourceAnalysis,
  topicIds, learner.text) and **ApiResponse<EvaluationResult>** from Block 1. The
  current multipart lessonTitle/learningSource/files payload and evaluationId-only
  response are provisional and need replacing, not maintaining as a parallel schema.
  Voice becomes text first. Learner file support, if retained, needs its own agreed
  normalization step before evaluation; it is not implemented in 3A.

The legacy Block 1 raw text/PDF analyze types remain for compatibility with fixtures
and tests; `/api/source/analyze` is still unimplemented. **AnalyzeImportedSourceRequest**
at `/api/analysis` is the canonical source-analysis input for the implemented flow.
