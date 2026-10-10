# ExplainBack - Backend/domain contract v1 (Block 1)

## Scope and file organization

Contract version `1.0` covers PDF/text sources, topics, graphs, lesson summaries,
and evaluation of learner explanations written as text. Recording, weights,
overall scores, a database, and authentication are outside this scope.
This block defines data, runtime validation, a fixture, and proposed APIs;
it does not implement endpoints, PDF processing, Gemini calls, or actual comparison.

Required strings must not be empty or contain only whitespace. Omit unknown
optional fields from JSON; for example, omit a blank `title` rather than sending
`null` or `""`.

- `src/backend/contracts/domain.ts`: domain types independent of React/React Flow.
- `src/backend/contracts/api.ts`: requests, responses, and the error envelope.
- `src/backend/contracts/validate.ts`: validator with no external dependencies.
- `src/backend/contracts/synthetic-demo.ts`: complete fixture and request/response examples.
- `tests/contracts/validate.mjs`: domain checks and invalid payload cases.

The repository has no established backend directory convention. The contract lives
in `src/backend/contracts/` to keep it separate from `src/types/lesson.ts`,
`src/fixtures/photosynthesis.ts`, and the current UI. Those files, components, CSS,
dependencies, and the lockfile remain unchanged.

## Review of the existing implementation

`AppShell` stores title/source/transcript in React state. `SourceInput` accepts
text; PDF upload is disabled. `RecorderPreview` loads a sample transcript and
transitions to the next screen after a timer. `UnderstandingMap` imports the fixture
directly and accepts only `onReset`; it does not receive backend results.
`EvaluationDetails` displays a `Relationship` containing both a source edge and its
evaluation. The fixture contains 6 React Flow nodes, 5 relationships, and 4 statuses.
The current summary only counts statuses.

Fields whose meaning can be reused include IDs, concept names, subjects/objects,
relation labels, expected assertions, learner statements, source quotes, and explanations.
Missing fields include documents/source blocks, topics, aliases/symbols, polarity,
conditions/formulas, roles, evidence verification/locations, graph identity,
lesson sections, many-to-many comparisons, suggestions, uncertain, and additional ideas.

## Domain entities and references

| Entity | Content and references |
| --- | --- |
| `Document` | `id`, `kind: pdf/text`, optional title, and ordered `blocks`. PDF bytes are outside the domain result. |
| `SourceBlock` | `id`, `documentId`, extracted text, and `location.page/section` when known. Source text lives in blocks rather than a duplicate document.text field. |
| `Topic` | `id` and title. Learner graph topics have `sourceTopicId` pointing to a source graph topic. |
| `Concept` | `id`, `topicId`, name, aliases, and optional symbol. A concept appearing in multiple topics is represented by separate nodes. |
| `Statement` | `id`, `topicId`, `subjectConceptId`, relation, `objectConceptId`, complete assertion, negated, conditions, optional formula, role, and evidence IDs. |
| `Evidence` | `id`, document/block IDs, quote, source/learner quote kind, verification, and optional location. |
| `KnowledgeGraph` | `id`, `documentId`, `kind`, topics, concepts, statements, and evidence. Together, these collections define the logical graph for each topic without coordinates. |
| `LessonSection` | One section per topic: a summary and key points. Both the summary and each key point reference statement IDs in the source graph. |
| `SourceAnalysis` | Version, ID, provenance, document, source graph, and lesson sections. The frontend retains this complete payload for subsequent evaluation. |
| `ComparisonItem` | ID, source topic, source/learner statement references, status, explanation, and suggestions. Evaluation statuses are kept separate from the knowledge graph. |
| `AdditionalIdea` | Learner statement references outside the supplied source, a topic for grouping, and an explanation; no correctness status. |
| `EvaluationResult` | Version, ID, provenance, sourceAnalysisId, evaluated topicIds, learner document/graph, comparisons, and additional ideas. |

### IDs and cardinality

1. IDs are non-empty strings matching `[A-Za-z0-9][A-Za-z0-9._:-]*`. They are opaque:
   do not infer meaning or matching from an ID's name. A UUID generator is not specified yet.
2. Source and learner graph/document IDs must be distinct within an evaluation
   bundle. System-wide uniqueness is not required while there is no storage.
3. Topic, concept, statement, and evidence IDs are unique **within each collection
   of each graph**. IDs may repeat across graphs or across entity types.
4. `SourceBlock.id` is unique within its document; section IDs within an analysis;
   key point IDs within a section; and comparison/additional idea IDs within their
   respective evaluation collections.
5. Concept/topic/evidence references inside a graph use local IDs. Cross-graph
   statement references always use `{ graphId, statementId }`, never a statement ID alone.
   `Topic.sourceTopicId` and `ComparisonItem.topicId` refer to the source graph
   supplied in the same analysis/evaluation bundle.
6. Each statement contains **one atomic assertion**, without combining two
   independent claims. Its complete assertion must express polarity and conditions
   consistently. `negated` applies to the named positive relation; do not combine a
   negative relation label with negated in a way that creates double negation.
   Conditions in v1 are descriptive strings rather than executable logical expressions.
   Formulas in v1 are strings without a parser.
7. A statement's subject/object must belong to its topic. A concept pair may have
   multiple statements; an edge's identity is its statement ID rather than its endpoints.
8. There is exactly one learner topic for each selected source topic, even when
   no assertions have been extracted. A learner graph may have no concepts,
   statements, or evidence. A source analysis must have at least one statement
   and one lesson section for every topic.

### Evidence and locations

- A PDF `page` is a physical, 1-based page number when known; omit it otherwise.
  Text has no `page`; never invent page 1. `section` is an optional label.
- `Evidence.location.charRange` uses **zero-based UTF-16 offsets within block.text**,
  `[start, end)`. These match JavaScript substring operations, not byte offsets.
  Python consumers must convert offsets when necessary.
- If evidence.page is present, it must match the corresponding PDF block's page.
  Unknown PDF locations may omit location entirely. PDF highlight bounding boxes
  are not defined yet.
- `verified` only means that the quote occurs exactly in the supplied block/range;
  it does not establish scientific truth or that the quote entails the statement.
  `unverified` retains a candidate quote awaiting verification and must not be
  presented as confirmed evidence. Each statement needs at least one evidence reference.
- A definite status (`correct/partial/contradicted/missing`) requires at least one
  verified quote for every referenced statement. Use `uncertain` if this basis is missing.
- Preserve quotes verbatim rather than replacing them with AI paraphrases.
  Assertions express normalized knowledge; quotes record its provenance, so the
  two fields may differ.
- For source/learner text, joining ordered block.text values with `\n\n` must
  reconstruct the exact request text. Do not trim or edit text after calculating
  offsets. A single block containing the full text is a valid, simple option.
  PDF offsets refer to extracted text.

### Evaluation and coverage

| Status | Meaning |
| --- | --- |
| `correct` | The learner assertion matches the source, including important conditions. |
| `partial` | The learner includes a relevant idea but omits necessary components or conditions. |
| `contradicted` | The learner makes an assertion that conflicts with the source. |
| `missing` | No corresponding learner assertion exists within an evaluated topic. |
| `uncertain` | There is insufficient evidence to conclude: ambiguous wording, unresolved matching, or unverified evidence. |

- `sourceStatements` is always non-empty. `learnerStatements` is `[]` for missing;
  uncertain may also use `[]`. The other three statuses require a learner statement.
- Many-to-many matching uses multiple references in **one** ComparisonItem within
  the same topic. Each evaluated source statement appears exactly once; each learner
  statement appears exactly once in either comparisons or additionalIdeas. This v1
  rule prevents double counting; item counts do not imply an overall score.
- Evaluation only covers the request's `topicIds`. Unselected topics are not marked
  missing. The response's learner graph only contains topics mapped to the selected set.
- Ideas outside the source are neither automatically incorrect nor automatically
  correct. V1 does not consult external knowledge to judge them. Ambiguous wording
  about an idea in the source belongs under uncertain; difficulty matching alone
  does not make it an additional idea.
- The validator checks structure, references, quotes, and coverage. It **does not**
  determine truth, atomicity, semantic consistency of polarity/conditions, summary
  quality, or whether an evaluation status is semantically correct. Those checks
  belong to the future pipeline and review process.

## End-to-end fixture

`synthetic-demo.ts` contains source text -> source graph -> lesson section -> learner
text -> learner graph -> evaluation. Everything is marked `provenance: synthetic_demo`;
it must not be described as actual PDF analysis or AI evaluation.

| Source idea | Learner idea | Result |
| --- | --- | --- |
| Chlorophyll absorbs light energy | The same assertion | correct |
| Glucose production requires CO2 and water | Only mentions CO2 | partial |
| Photosynthesis releases oxygen | Denies oxygen release | contradicted |
| Glucose stores chemical energy | No corresponding assertion | missing, empty learner references |
| Light energy powers photosynthesis | "may affect ... somehow" | uncertain |
| The source does not discuss chloroplasts | Plant cells contain chloroplasts | additionalIdeas, no status |

The fixture deliberately repeats statement IDs across the two graphs to show why
graphId cannot be omitted. Evidence ranges point to exact assertions in their documents.

The exports `demoAnalyzeRequest`, `demoAnalyzeResponse`, `demoEvaluateRequest`, and
`demoEvaluateResponse` are complete objects that can be serialized with JSON.stringify
as exchange examples.

## Proposed APIs (not implemented)

V1 uses two synchronous operations. The paths below are proposed for integration
discussion; no routes are implemented. All JSON uses schemaVersion `1.0`.

### 1. POST /api/source/analyze

**Text**: `Content-Type: application/json` with `AnalyzeTextRequest`:

```json
{
  "schemaVersion": "1.0",
  "source": {
    "kind": "text",
    "title": "Photosynthesis",
    "text": "Chlorophyll absorbs light energy."
  }
}
```

**PDF**: `multipart/form-data` with exactly two parts:

- `metadata`: a JSON string containing `AnalyzePdfRequest`, for example
  `{"schemaVersion":"1.0","source":{"kind":"pdf","title":"Lecture"}}`.
- `file`: one PDF's bytes, with MIME type `application/pdf`. Title is optional.

Do not send a URL/path or base64 in JSON. The request validator currently checks
metadata only; a future endpoint must check file presence, actual type, size,
and readability.

**200 response**: the success branch of `AnalyzeSourceResponse`:

```ts
{ ok: true, schemaVersion: "1.0", data: sourceAnalysis }
// data: complete SourceAnalysis = document + graph + lessonSections + provenance.
// Complete example: demoAnalyzeResponse in synthetic-demo.ts.
```

Failed knowledge extraction or an unreadable PDF returns an error rather than an
empty graph presented as success. V1 has no asynchronous job IDs or polling.

### 2. POST /api/explanations/evaluate

`Content-Type: application/json` with `EvaluateTextRequest`:

```ts
// When analyzeResponse.ok === true:
const request: EvaluateTextRequest = {
  schemaVersion: "1.0",
  sourceAnalysis: analyzeResponse.data,
  topicIds: ["photosynthesis"],
  learner: { text: "Chlorophyll absorbs light energy." },
};
// sourceAnalysis is the complete object, not just its ID.
// Complete example including the source payload: demoEvaluateRequest.
```

`topicIds` is required, non-empty, unique, and must belong to the source. To evaluate
the entire document, submit all source topic IDs. Learner text is non-empty;
audio input is not supported.

**200 response**: the success branch of `EvaluateTextResponse`:

```ts
{ ok: true, schemaVersion: "1.0", data: evaluationResult }
// data: complete EvaluationResult = learner document/graph, comparisons,
// additionalIdeas, sourceAnalysisId, evaluated topicIds, and provenance.
// Complete example: demoEvaluateResponse.
```

The frontend retains the analysis result in its session and sends it back in full
for evaluation. The backend does not look up documents by analysis/document/graph ID
or assume a cache or storage. The source graph remains in the request/frontend;
the evaluation response does not duplicate it. If a reload loses the payload, the
frontend must analyze the source again or retain the payload under a future agreement.
Evaluation does not resend PDF bytes because source blocks/evidence are already
included in the analysis.

A future backend must validate the supplied source payload before using it.
Schema/quote checks do not prove that the server produced it; v1 treats it as
client-supplied context rather than authenticated data or an exam grade.
Signed payloads and authentication are not implemented.

### Error envelope and proposed HTTP statuses

```json
{
  "ok": false,
  "schemaVersion": "1.0",
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Learner text must not be empty.",
    "retryable": false,
    "details": [{ "path": "$.learner.text", "message": "Expected a non-empty string." }]
  }
}
```

| HTTP | Code | Meaning | retryable |
| --- | --- | --- | --- |
| 400 | INVALID_REQUEST | Invalid schema, version, input, or topicIds | false |
| 413 | PAYLOAD_TOO_LARGE | File, text, or payload exceeds a limit | false |
| 415 | UNSUPPORTED_SOURCE | Source is neither PDF nor text | false |
| 422 | UNREADABLE_DOCUMENT | PDF is unreadable or requires unsupported OCR | false |
| 422 | INVALID_SOURCE_ANALYSIS | Resubmitted source payload has invalid references, quotes, or coverage | false |
| 500 | ANALYSIS_FAILED | A valid analysis could not be produced | false |
| 500 | EVALUATION_FAILED | A valid evaluation could not be produced | false |
| 503 | UPSTREAM_UNAVAILABLE | Provider is temporarily unavailable | true |

Errors do not expose stacks, prompts containing document data, API keys, or raw
provider errors. `details` is optional and uses paths into the payload. There is
no document lookup 404 because there is no storage. Specific size/timeout limits
are not set in this block.

## Mapping to the current UI

| Current UI/field | Domain equivalent | Missing support or coordination needed |
| --- | --- | --- |
| AppShell title/source | Document.title / blocks[].text | Retain SourceAnalysis in the session; add PDF and API/error handling during integration. |
| AppShell transcript | EvaluateTextRequest.learner.text | Text is the primary input in v1; the mock recorder remains unchanged. |
| conceptNodes[].id | Concept.id | Prefix with graphId when rendering both graphs on one canvas. |
| conceptNodes[].data.label | Concept.name | Aliases/symbol/topic are available; coordinate their presentation with frontend. |
| Node.position and React Flow types | Absent from backend | Frontend owns layout and the domain -> React Flow adapter. |
| Relationship.id | Statement.id for edges; ComparisonItem.id for evaluations | These IDs are distinct. A comparison may contain multiple edges. |
| Relationship.source/target | Statement.subjectConceptId/objectConceptId | Filter by topic and resolve within the corresponding graph. |
| Relationship.label | Statement.relation | UI must represent polarity/conditions/formulas without losing negation. |
| Relationship.expected | Source Statement.assertion | A ComparisonItem may reference multiple source assertions. |
| Relationship.status | ComparisonItem.status | Add uncertain to UI types, colors, badges, legends, and counts; not changed in this block. |
| Relationship.statement | Learner references -> Statements -> assertion/evidence quote | May contain zero or multiple assertions; missing uses [], displayed as Not mentioned by the adapter. |
| Relationship.quote | Source references -> Statement.evidenceIds -> Evidence.quote | May contain multiple evidence entries; locations and verification are not currently supported by UI. |
| Relationship.explanation | ComparisonItem.explanation | Add suggestions and keep additionalIdeas separate. |
| .summary (status counts) | Count ComparisonItems by status | Needs five statuses and topic scope; this is not a lesson summary or an overall score. |
| No topic/lesson view | graph.topics / LessonSection | Coordinate topic selection, summary/key point presentation, and statement links. |
| UnderstandingMap fixture import | SourceAnalysis + EvaluationResult | Receive data through props/an adapter instead of a fixed import during integration. |
| EvaluationDetails accepts Relationship | ComparisonItem + resolved statements/evidence | Current UI cannot fully represent many-to-many comparisons or additional ideas. |

Converting the backend contract directly into `Relationship` would lose information.
This table is an integration plan, not an implemented change. `src/types/lesson.ts`
has not been changed, and no frontend adapter has been added. Those changes need
agreement with the teammate responsible for UIUX.

## Verification and execution

```sh
node --test tests/contracts/validate.mjs
```

Tests use Node's built-in `node:test` and native TypeScript stripping, verified on
Node `24.13.1` in this environment without installing packages. The command does
not start Next.js or require Playwright. `validate.mjs` does not match Playwright's
default `*.spec.*`/`*.test.*` patterns, keeping the two runners separate.
The project now requires Node.js 22+ for Block 2's unpdf dependency. Native
TypeScript test execution was verified on Node 24.13.1; environments without
TypeScript stripping need an appropriate compiler/runner. Package scripts are unchanged.

Checks cover JSON round trips, all five statuses, reference/ID uniqueness, topic
isolation, source/learner graph boundaries, lesson links, exact quotes/ranges,
PDF page metadata, UTF-16, empty missing/uncertain references, parallel edges,
many-to-many coverage, additional ideas without verdicts, malformed/extra fields,
request/response binding, and errors.

At the initial Block 1 verification, `node_modules` and the repository's TypeScript
compiler were unavailable. Native stripping checks syntax/runtime and **does not
replace type checking**. `npm run typecheck`, `npm run build`, and the Playwright UI
suite had not been run. The Next.js guides in `node_modules/next/dist/docs/` were
also unavailable. This block does not modify Next.js code, install dependencies,
or change the lockfile to bypass that limitation.

Result on 2026-10-10: **64 tests passed, 0 failed** using the command above. Node
emits a `MODULE_TYPELESS_PACKAGE_JSON` warning when detecting ES modules in the
TypeScript files; the tests still pass. The project's package.json was not changed
solely to remove that warning.

After the English-language update on 2026-10-10, repository dependencies were
available and `npm run typecheck -- --incremental false` passed. All 64 contract
tests also passed with `node --test --test-isolation=none tests/contracts/validate.mjs`.
The default test runner could not spawn a child process in this environment
(`spawn EPERM`), so the tests were run without process isolation. The build and
Playwright UI suite were not rerun for this translation-only change.

## Selected decisions and remaining coordination

Backend contract v1 uses graph-independent payloads, local IDs with graph references,
the full source payload resubmitted for evaluation, synchronous operations,
explicit topic scope, UTF-16 block offsets, one lesson section per topic,
many-to-many grouping without double counting, five statuses, and separate
additional ideas.

Before integration, coordinate route/envelope/schema names with frontend, UI support
for uncertain, topics/summaries, multiple statements/evidence entries, and additional
ideas, plus the adapter's location and frontend layout approach. The existing UI
contract remains unchanged.

Before implementing the actual pipeline, decide PDF/text limits and timeouts,
scanned PDF/OCR support, output language, topic splitting/alias normalization,
atomization, matching, polarity/conditions/formulas, and evidence requirements for
status selection. The Block 1 validator neither defines those algorithms nor
replaces semantic evaluation.

## Block 2 compatibility extension

Source ingestion is now implemented separately at `POST /api/sources`; the two
analysis/evaluation operations above remain proposed and unimplemented.
See [Source ingestion](source-ingestion.md) for the live API and frontend handoff.

The backend contract retains schemaVersion `1.0` and adds `docx` to Document.kind,
optional BlockLocation.paragraph, SourceBlock.original, and SourceBlock.normalizedRange.
`ImportedSource` reuses Document/SourceBlock and carries original segments,
normalized text, extraction metadata, and warnings. It is not a SourceAnalysis
and contains no topics, knowledge graph, summary, or evaluation.

The error envelope adds OCR_UNSUPPORTED, PASSWORD_REQUIRED, and SOURCE_IMPORT_FAILED.
The existing Block 1 fixture and its 64 tests remain valid without modification.
SourceAnalysis evidence ranges are still block-local. In ImportedSource, original
ranges point into originalSegments[].text and normalized ranges point into
normalizedText. These coordinate systems are distinct and explicitly named.

ImportedSource.normalizedText normalizes the original segments and joins them with
two newlines. Unlike the earlier analysis text convention, it is not formed by
joining every split block: splitting a long paragraph must not insert new content.
The future AI block should reuse the imported document/block IDs and consume this
complete payload, with an explicit analysis request contract agreed at that stage.

## UI integration after merging main

The UI review and mapping above describe the Block 1 prototype. The current UI
now accepts learning-source files, records microphone audio, and has provisional
clients for POST /api/transcriptions and POST /api/evaluations. Neither endpoint
is implemented by Block 2, and those clients do not use ImportedSource or the
proposed stateless analysis/evaluation payloads. Results still use demo fixtures.

The UI allows PDF/DOC/DOCX/GDOC files up to 10 MB, while POST /api/sources accepts
PDF/DOCX up to 3,000,000 bytes or JSON text. These contracts require coordination
before integration; the merge preserves both implementations without claiming
that their formats, limits, or operations are interchangeable. Node.js 22+ is the
current project requirement.

## Block 3A implementation

The canonical implemented analysis operation is now `POST /api/analysis`, taking
`AnalyzeImportedSourceRequest` with a full ImportedSource and optional
outputLanguage (`source`, `en`, `vi`). The legacy raw text/PDF analyze request types
and proposed `/api/source/analyze` path above remain unimplemented compatibility
examples. Do not use them as the input contract for the new endpoint.

SourceAnalysis adds optional sourceWarnings (ingestion warnings copied unchanged)
and analysisWarnings (AMBIGUOUS_EVIDENCE/QUESTIONS_PRESENT with blockId). Original
segments and ingestion metadata stay in the separately retained ImportedSource.
The schemaVersion stays 1.0; existing synthetic fixtures remain valid. Graph domain
data still contains no positions or learner evaluation statuses.

See [Source analysis](source-analysis.md) for the Gemini adapter, request/response,
limits, bounded repair/retry policy, evidence positions, tests and frontend handoff.
New error codes are AI_NOT_CONFIGURED, AI_TIMEOUT, AI_RATE_LIMITED,
AI_OUTPUT_INVALID, AI_OUTPUT_TRUNCATED and NO_EXTRACTABLE_KNOWLEDGE.
Transcription/evaluation remain unimplemented; later evaluation should reuse
EvaluateTextRequest/EvaluationResult rather than the provisional UI multipart schema.
