# ExplainBack - Source analysis (Block 3A)

Current default: [nonblocking graph output](nonblocking-output.md). Readable AI data
is normalized for display without quality repair/rejection. Quality gates, repair
and warnings described below document the earlier implementation and are superseded
by that page; input/service limits remain in force.

Current graph/API contract: [v2 migration and architecture](backend-contract-v2.md).

For the implemented multi-section sequential web flow, checkpoint protocol and limits,
see [topic processing](topic-processing.md). The single-call route described below
remains supported; the web client opts into section processing when needed.


## Scope and end-to-end contract

The intended learning flow is:

`text/PDF/DOCX -> POST /api/sources -> ImportedSource -> POST /api/analysis -> SourceAnalysis -> learner text/transcript -> POST /api/evaluations -> EvaluationResult`.

This document covers source analysis. Transcription and evaluation are now implemented
and integrated separately; see [Blocks 3B/3C](source-explanations.md). No endpoint
returns fake success. Database and authentication remain out of scope.

The server has no session storage. Keep the complete **ImportedSource** and
**SourceAnalysis** separately in frontend state. A document or analysis ID cannot
reload either object. ImportedSource retains originalSegments, extraction metadata
and warnings. SourceAnalysis retains the exact imported document/blocks and copies
warnings into `sourceWarnings`; it adds topics, reference knowledge and lessons.
`provenance: analysis` means the analysis operation ran, not that every assertion
is independently scientifically verified. Optional `analysisWarnings` carries
repeated-quote, question/exercise, projection-review and coverage caveats. Block 1
fixtures remain `synthetic_demo` and now use v2; old v1 payloads are rejected.

## POST /api/analysis

Node.js route, synchronous JSON operation, no file upload at this stage.

```ts
// First call /api/sources using its existing JSON/multipart contract.
const request: AnalyzeImportedSourceRequest = {
  schemaVersion: "2.0",
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
  schemaVersion: "2.0",
  data: {
    schemaVersion: "2.0",
    id: /* backend-generated analysis UUID */,
    provenance: "analysis",
    document: /* unchanged importedSource.document */,
    graph: {
      id: /* graph UUID */, documentId: /* same document ID */, kind: "source",
      topics: /* topic IDs and titles */,
      concepts: /* document-wide canonical names, aliases, document ownership and optional symbols */,
      statements: /* binary or complex representations, full assertions, polarity, conditions and evidence IDs */,
      evidence: /* original quotes, block IDs, verification and optional block-local offsets */
    },
    lessonSections: /* one summary/key-point section per topic, linked to statement IDs */,
    sourceWarnings: /* exact importedSource.warnings */,
    analysisWarnings: /* AMBIGUOUS_EVIDENCE / QUESTIONS_PRESENT / EXTRACTION_REVIEW / UNUSED_CONCEPT / COVERAGE_LIMIT */
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
the full draft JSON schema supplies the local runtime shape validator. The Gemini
adapter sends a copied projection without minItems/maxItems; local validation still
enforces every collection bound before accepting generated data. The complete
bounded provider schema returned 400, while removing only these bounds returned
200 with STOP and passed draft/domain validation in the follow-up diagnosis.

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
produced by this installed version and verifies that projecting provider bounds
does not mutate the original runtime schema. SDK HTTP retries are explicitly disabled
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
| AI calls per request | 2 maximum, including initial call and one output repair |
| Per-call / total AI time | 60,000 / 122,000 ms |
| Output-repair delay | 250 ms |

There is no batching. A valid Block 2 source may exceed Block 3A's supported scope;
return 413 without silently truncating it. Input/collection size ceilings are not
token guarantees. A model can still reach its output-token limit; MAX_TOKENS fails
without returning a partial graph. A second call cannot exceed the same output cap.

One repair is allowed for malformed JSON, shape/reference/evidence/lesson-link errors.
Known statement failures use a local patch: only failed claims, their original blocks,
the canonical concept catalog and affected lessons are sent. Statement/topic IDs and
good claims remain unchanged; concept rewrites, claim removal and lost lesson links
are rejected. The merged extraction is fully revalidated. Errors that cannot identify
claims (for example malformed JSON/global structure) retain complete regeneration with
the original blocks, controlled errors and previous draft when available. Raw SDK
diagnostics are never sent.
Only identical records with the same canonical concept ID merge; different IDs stay distinct.
Exact duplicate statements are remapped without fuzzy name merging.
Knowledge blocks must have an extracted supporting statement. Every input block
must be accounted for, though this does not prove every semantic claim was extracted.

A temporary upstream/network failure is surfaced without automatic retry. Missing/
rejected config, rate-limit, timeout, blocked output, truncated output and a valid
no-knowledge result are also not automatically retried. Provider Retry-After, when
present, is preserved as a numeric response header. Respect this before a user retry.
Error.retryable indicates whether a later user retry may help, not that the backend
will retry now. Cancellation bounds local waiting;
Google notes that abort does not cancel service processing or applicable charges.
The limits apply per request; there is no global rate limiter/authentication in this scope.

## Evidence, IDs and question boundaries

The backend creates graph/entity/section IDs and remaps every reference. Imported
document/block IDs and contents are never regenerated, rewritten or repaired.
Each graph collection has locally unique IDs; cross-graph statement references
remain `{ graphId, statementId }` for future evaluation.

AI supplies `blockId` and a verbatim `quote`. Offsets and verification supplied by AI
are rejected. Optional legacy context hints are accepted but never required. Backend
searches the block, computes UTF-16 `[start,end)` and derives up to 80 characters of
adjacent context on each side. A unique occurrence ignores invalid hints. Repeated
quotes use valid discriminating hints if available; unresolved ambiguity stays
unverified without a fabricated range. Zero occurrences fail and may trigger repair.
Empty optional contexts become absent. Verified quote location is not entailment.

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

All use `{ ok: false, schemaVersion: "2.0", error: { code, message, retryable } }`.
Messages are controlled: no secret, source text, prompt or SDK stack is logged/returned.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | INVALID_REQUEST | Invalid or inconsistent ImportedSource/request |
| 413 | PAYLOAD_TOO_LARGE | Request/input exceeds supported scope |
| 415 | UNSUPPORTED_SOURCE | Request is not JSON |
| 422 | NO_EXTRACTABLE_KNOWLEDGE | Questions/exercises/no explicit knowledge |
| 422 | ANALYSIS_FAILED | Provider blocked or did not finish usable output |
| 429 | AI_RATE_LIMITED | Provider quota/rate limit; try later |
| 503 | AI_NOT_CONFIGURED | Missing config, rejected key, denied access, or model not found; controlled messages distinguish these cases |
| 503 | UPSTREAM_UNAVAILABLE | Temporary provider/network failure after bounded retry |
| 504 | AI_TIMEOUT | Per-call or total deadline exceeded |
| 502 | AI_OUTPUT_INVALID | Invalid output after the repair budget |
| 502 | AI_OUTPUT_TRUNCATED | Provider reached output limit |
| 500 | ANALYSIS_FAILED | Upstream request/schema/generation-config rejection (400), or unexpected local failure |

Every response includes a server-generated `x-request-id`. Server diagnostic logs
contain only stage/call numbers, elapsed times, config presence/model, outgoing
schema size/bounds, upstream status/code, finish reason/token counts and validation
outcomes. No source text, prompts, quotes, SDK error messages or keys are logged.
In development the same metadata is written to the ignored
`.next/dev/logs/source-analysis.jsonl`; production uses console logging only.

The SDK's timeout option also sets `X-Server-Timeout` in seconds. A live short-source
request returned upstream 504 DEADLINE_EXCEEDED at 24.3 seconds with the old 25-second
setting, before the pipeline timer. It had one initial call and no output repair.
The SDK and pipeline now share a 60-second call window; the 122-second total window
allows one bounded repair. The UI fetch has no independent timeout (only user/reset
cancellation), and the opt-in browser smoke derives its deadlines from these limits.
The HTTP route adds no separate local timer. These are local-app limits, not a
guarantee about production hosting timeouts or real-model response latency.

Upstream 400 alone does not establish an invalid key or model. Explicit invalid/expired
key diagnostics map to AI_NOT_CONFIGURED; other invalid arguments map to ANALYSIS_FAILED
without repair or automatic retry. Raw upstream messages are not exposed. See the
[local Gemini diagnosis](gemini-diagnosis.md) for the observed configuration failure
and the remaining inconclusive schema/provider observations.

## Local verification from PowerShell

Requires Node 22+ (native TypeScript Block 1 tests were verified with Node 24.13.1).

```powershell
npx tsc -p tests/analysis/tsconfig.json
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
$request = @{ schemaVersion = "2.0"; source = @{ kind = "text"; text = "Glucose stores chemical energy. Chlorophyll absorbs light energy." } } | ConvertTo-Json -Depth 5
$source = Invoke-RestMethod "http://localhost:3000/api/sources" -Method Post -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($request))
$request = @{ schemaVersion = "2.0"; importedSource = $source.data; outputLanguage = "en" } | ConvertTo-Json -Depth 30
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

The [UI integration](ui-source-analysis.md) now calls /api/sources, stores its complete result,
then calls /api/analysis and retains both results across steps. Clear stale analysis when
source changes, preserve input on errors, display source/analysis warnings, topics,
summaries and evidence. Filter domain concepts/statements by topic and calculate
React Flow positions in a frontend adapter. Source graph edges have no learner
evaluation status. The frontend uses a separate reference-graph adapter and never
invents correct/missing badges or substitutes demo results when the API fails.

Blocks 3B/3C now implement multipart `audioFile` transcription and JSON
`EvaluateTextRequest` evaluation with full ImportedSource and SourceAnalysis.
PDF/DOCX explanations reuse ingestion before becoming editable learner text.
See [Transcription and evaluation](source-explanations.md) for the implemented
contracts, UI integration, limits and live evidence. Source analysis itself still
returns source knowledge only, without evaluation statuses or layout coordinates.
