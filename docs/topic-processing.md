# Multi-section source analysis and topic views

This extends graph contract 2.0 on `feat/extraction-quality-v2`. Final `SourceAnalysis`
and evaluation shapes are unchanged. No database, queue, persistent jobs or new route.

## Flow and planning

`POST /api/sources -> ImportedSource -> sequential POST /api/analysis -> complete
SourceAnalysis -> topic selector -> graph / summary / statements / evidence`.

`planSourceParts` in `src/backend/analysis/sections.ts` uses explicit Markdown headings
or short standalone heading lines followed by body text. The heading must start an
extracted block; lost PDF formatting cannot be reconstructed. Preamble uses the
document title or `Source overview`. This is deterministic organization from source
headings, not an AI semantic-topic planner. Unheaded text remains one semantic topic
even when multiple technical parts are required. Paragraphs are not automatically
topics. Short sources still use the existing single-call path and can yield one topic.

Within each semantic section, ordered whole source blocks are grouped into bounded
technical parts. Adjacent small sections are packed together up to a 2,000-character
target, below the hard 4,000-character ceiling. A part can cover several topics and
a topic can span multiple parts; a block is never sliced, renamed,
retyped or silently discarded. Original segment IDs, normalized ranges, text and
locations remain on the complete original ImportedSource. AI sees only the current
part's blocks, the canonical concept catalog and limited previous-topic summary
context. That context cannot be used as a quote. It does not see previous full graphs.

Every part returns each supplied semantic topic ID/title, its assertions and lesson.
Each statement must have evidence from its assigned section's blocks.
New concept/statement draft IDs get a part namespace; reused catalog concept IDs
must preserve their exact name/symbol. Established aliases remain unchanged; omitted
or newly suggested aliases do not redefine the catalog record. No fuzzy or spelling-only merge is
performed. AI decides whether a known entity has the same meaning; duplicate names
with different IDs stay distinct. Normalization does not infer missing roles or edges.
Binary/complex distinctions, polarity, scope, all participants and evidence rules
are retained. Complex remains a card, not an arbitrary canvas projection.

At completion, `mergePartDrafts` combines dispositions and statements, coalesces
lessons for the same topic, preserves canonical IDs and runs the full original
normalizer/domain/source-binding validator once for the accepted graph. It requires
all original source blocks to be accounted for and valid lesson/evidence references.
Structural coverage and quote verification are not proof of complete semantic coverage.

## Stateless opt-in wire protocol

Single-call clients may continue submitting `AnalyzeImportedSourceRequest` without
`processing`; their response remains `ApiResponse<SourceAnalysis>`. The web client
opts in whenever the source plan contains more than one technical part or more than
one semantic topic, including multiple topics packed into one request:

```ts
{
  schemaVersion: "2.0",
  importedSource, // complete, validated original ingestion payload
  outputLanguage: "source", // optional
  processing: { completedParts: [], callsUsed: 0 }
}
```

One POST processes one unfinished part; there is no server session lookup. An
intermediate response has the normal envelope with:

```ts
{
  ok: true, schemaVersion: "2.0",
  data: {
    kind: "part_complete",
    part: { partId, calls, sourceHash, draft }, // internal validated v2 draft checkpoint
    completed, total, nextTitle
  },
  processing: { callsUsed }
}
```

The next POST supplies the ordered completedParts prefix and callsUsed. Backend
checks its schema, namespace, graph/evidence, source fingerprint and graph capacity
before creating the provider. The SHA-256 fingerprint covers full ImportedSource and
output language; it detects accidentally reused checkpoints, not authenticity or proof
that AI produced them. Stateless clients remain responsible for their submitted data.

The final response's data is the complete SourceAnalysis v2; optional `processing`
contains callsUsed. A processing failure uses the existing ApiError and, once a call
has begun, returns callsUsed so manual retries do not erase spent attempts. Failed or
unfinished parts never become a presented analysis. API key/SDK stay server-side.

## Limits and retries

| Limit | Value |
| --- | --- |
| Ingestion text / compressed PDF-DOCX / PDF pages | 100,000 UTF-16 units / 3,000,000 bytes / 30 pages |
| Analysis original and normalized source / blocks | 20,000 UTF-16 units / 120 blocks |
| Technical part / parts | 4,000 UTF-16 units of whole blocks / 6 parts |
| Total generation budget per orchestration attempt | 8, including repairs; SDK one attempt |
| Part repair | At most one invalid-output repair; never retry provider failures |
| Entire graph | 12 topics, 100 concepts, 120 statements, 480 evidence records |
| Lesson / statement | 20 key points per topic / 4 evidence items per statement |
| Request / generated JSON / output tokens | 1,000,000 bytes / 100,000 UTF-16 units / 8,192 tokens per generation |
| SDK call / HTTP part pipeline | 60 seconds / at most 122 seconds |
| Evaluation learner / full request | 10,000 UTF-16 units / 1,000,000 bytes |

Preflight rejects unsupported source/plans/checkpoints before AI. Remaining statement
and key-point capacity is allocated across unfinished parts, reserving an initial
generation for each part before allowing repairs. Limits are enforced after each
draft and after aggregate merge; claims are not deliberately cut to fit. The final
serialized source+graph evaluation payload reserves 60,000 bytes for the maximum
JSON-escaped learner input. A graph that cannot fit is rejected explicitly, rather
than appearing successful and failing the next endpoint for payload size.

The full workflow is several HTTP requests, each with its own existing bounded AI
call deadline. Hosting must permit those requests; this is local Node deployment
support, not a promise to process arbitrary long files. More than six technical parts
or twelve semantic topics is rejected even below 20,000 characters. The UI reports actual completed parts
and the current section, without invented percentages.

Successful checkpoints live only in React memory. Manual retry reuses the ingestion
payload and completed parts; provider errors do not automatically cause another
request. Source/title/file change or reset invalidates checkpoints and results.
Revision/abort checks prevent late responses from repopulating a changed session.
Revisiting the source step keeps completed analysis; selecting topics never calls AI.

## Topic UI

Existing `UnderstandingMap` defaults to the first source-ordered topic. Its keyed
`TopicAnalysis` remount discards the previous statement/edge selection and fits the
new graph. Statements are filtered by topic ID; `toReferenceFlow` exposes the union
of referenced endpoint/participant concepts, including shared document-wide concepts.
No edge is invented to link topics. Summary, list and evidence panel use the same
topic-filtered records. Existing evaluation status overlays use stable reference IDs.
No evaluation algorithms, layout design, scoring or voice behavior were changed.

## Checks and artifacts

The existing complete `tests/analysis/fixtures/multisection-source.txt` is used, including
its original Markdown and attribution. Synthetic provider fixtures are explicitly
labeled. Offline checks cover headings versus chunks, aggregate IDs/quotes/source,
canonical reuse, unknown/forged checkpoints, partial failure/resume, evaluation
compatibility and schema enum isolation. The latter caught a genuine new bug:
`structuredClone` retains shared text-rule aliases; enum constraints must replace
individual topic rules rather than mutate a shared string rule. No validator was relaxed.

Browser fixtures exercise default topic and 1 → 2 → 3 → 1, exact visible node IDs,
edge/list counts, summary/panel reset, no requests on switching, completed-part retry,
back navigation and full reset on desktop/mobile. Existing session tests cover short
source, PDF/DOCX ingestion, duplicate submits and late responses. Results are below.

Private artifacts under `test-results/topic-processing` include mock pipeline output,
browser screenshots, generation ledger and actual API responses.
They are ignored and must not be staged. Live budget includes the two failed generations
that exposed the enum bug; the ledger is never reset after that attempt.

### Verification in this session

The final offline domain/analysis suite passed 216 tests; four offline transport-guard
tests also passed, including rejection of the ninth generation at an eight-call cap.
Typecheck and production build passed. The desktop/mobile browser run passed 34
tests; two live opt-in cases were intentionally skipped in that mock run.
Browser checks use explicitly synthetic analysis responses; PDF/DOCX
session checks call real local ingestion with mocked analysis. Browser switching is
not evidence that Gemini successfully extracted the complete multi-section source.

All eight actual generations used the configured `gemini-3.5-flash-lite`. Their
upstream HTTP responses were 200; no provider quota or overload was returned.
The first attempt exposed the shared schema-rule enum bug. The second exposed an
overstrict alias equality check on reused canonical IDs. Both received targeted
code fixes and regression checks. The final full-source attempt used three parts:

| Technical part | Semantic topics | Real result |
| --- | --- | --- |
| 1 | First three source sections | Accepted checkpoint; 3 topics |
| 2 | Light-dependent reactions / Calvin cycle | Accepted checkpoint; 4 accumulated topics |
| 3 | C3 / C4 photosynthesis | Rejected draft; no complete SourceAnalysis |

The last draft copied the joint assertion about a four-carbon compound splitting
into carbon dioxide **and** a three-carbon compound onto two partial binary edges.
The existing projection validator rejected those edges. The diagnostic guard then
blocked repair before network access because eight actual generations were already
spent. The final local HTTP 503 was guard-related, not a Gemini 503 response. The
scoped instruction now explicitly requires a complete complex claim or independent
standalone binary assertions for such joint transformations; this prompt adjustment
has **not** been live-verified. No validator was weakened and no saved draft was
corrected to manufacture success.

Artifacts `live.json`, `generation-6.json`, `generation-7.json` and
`generation-8.json` record that attempt unchanged. There is no successful live graph
or live topic-switching receipt. A new live session is still needed to verify the
complete real graph and topic 1 -> 2 -> 3 -> 1 on the UI.

## Changed files in this task

- Backend/contracts: `src/backend/analysis/{sections,section-pipeline,pipeline,handler,limits}.ts`,
  `src/backend/contracts/api.ts`.
- Client/UI: `src/lib/{source-analysis,use-source-analysis}.ts`,
  `src/components/{AppShell,SourceInput,UnderstandingMap}.tsx`.
- Tests: `tests/analysis/topic-processing{,-fixture}.mjs`, `tests/topic-processing.spec.ts`,
  `tests/analysis/live-budget.cjs` (opt-in diagnostic cap accepts eight calls),
  `tests/analysis/diagnostic-budget.mjs` (offline eight-call boundary).
- Documentation: this file, `source-analysis.md`, `backend-contract-v2.md`, `README.md`.

Previous unstaged work is preserved. No secrets, next-env.d.ts, generated artifacts,
stage, commit, push, branch change or deploy is part of this task.

## Local use

Run `npm run dev`, open the local URL and paste the full
`tests/analysis/fixtures/multisection-source.txt` into the source input, or upload a
supported PDF/DOCX with headings preserved by ingestion. Continue starts ingestion
and sequential analysis. On a partial failure, Retry keeps successful checkpoints
in this browser session. After complete success, choose Topic to switch graph,
summary, statements and evidence without new API calls. Start over clears the session.
Unheaded sources have one planned semantic topic; their technical chunks do not
become separate topics. The source must still satisfy the published limits.

Reproduce the synthetic checks without real generation:

```powershell
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/analysis/topic-processing.mjs
npm run typecheck
npm run build
# Against a running local server; both test files mock analysis.
npx playwright test tests/topic-processing.spec.ts tests/session.spec.ts --workers=1 --retries=0
```

The standalone browser fixtures need the preceding offline topic-processing test
to create ignored artifacts. They never enable the live opt-in environment variable.
