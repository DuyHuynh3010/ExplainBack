# ExplainBack - Source-analysis UI integration

Current graph/API contract: [v2 migration and architecture](backend-contract-v2.md).


## Delivered flow

The existing SourceInput and importLearningSource client still call POST /api/sources.
The new analysis client sends `{ schemaVersion: "2.0", importedSource }` to POST
/api/analysis. Both use same-origin requests. Gemini configuration and SDK imports
stay in the backend. Client runtime validators reject malformed/unbound responses.
No backend contracts, dependencies or lockfile changed in this integration.

The screens are now learning source -> source analysis -> learner explanation.
The existing design is retained, with topic selection, summary, warning and source
evidence views. Source analysis is available without evaluation. Source concepts
and statements use neutral styling; selecting a relationship does not grade it.

## Local walkthrough

Requires Node 22+ and installed repository dependencies. Configure GEMINI_API_KEY
and GEMINI_MODEL in the ignored .env.local, using an account-accessible model that
supports structured JSON. Never prefix these with NEXT_PUBLIC. Restart after edits.

```powershell
Set-Location C:\code\ExplainBack
npm run dev
```

Open http://localhost:3000:

1. Optionally enter a title. Paste a short factual source, for example
   `Glucose stores chemical energy. Chlorophyll absorbs light energy.`
2. Select Continue. Importing and analyzing have separate indicators; a second
   submission is disabled. Editing input, Cancel processing or Start over cancels
   the current frontend request.
3. After successful analysis, select a topic. Read its summary/key points and select
   a graph edge or a relationship row to view the assertion and source evidence.
   Supporting-statement links in the summary also select the evidence detail.
4. Evidence shows the verbatim quote, real PDF page/paragraph when present,
   block-local UTF-16 range when available, and verified/unverified. Expand View
   source block for context. Verified is quote occurrence, not semantic correctness.
5. Back to source keeps input/results. Continue reopens the existing analysis
   without another request. Changing title, text or file clears stale analysis and
   learner input, requiring a fresh import/analysis.
6. Write your explanation opens the existing typing/file/recording controls.
   Back to analysis preserves explanation text/file/audio and the chosen topic.
   Evaluate and Create transcript are disabled with clear availability messages.
7. Start over clears the entire React session, including in-flight work and input
   errors. Reload also clears the session; no persistence or database was added.

For files, choose tests/sources/fixtures/partial.pdf or paragraphs-table.docx through
Upload learning material. Only PDF/DOCX up to 3,000,000 actual bytes are accepted;
these have genuine extraction plus ingestion warnings. Analysis still has its own
20,000 UTF-16-character/120-block scope; a file under the upload byte limit may
exceed that scope. No truncation or demo fallback occurs.

Load sample lesson loads sample text only. Continue uses the real API. There is no
active demo graph mode and no synthetic result substituted for failed requests.

## State, retry and layout

useSourceAnalysis owns separate ImportedSource and SourceAnalysis state plus
idle/importing/analyzing phases and errors. A synchronous controller guard prevents
duplicate work. A revision token and AbortController invalidate obsolete requests,
including transports that ignore cancellation. Unmount also invalidates requests.
Analysis failure retains the complete import and input; Retry only calls analysis.
Import failure retries ingestion. There is no automatic frontend retry loop.
Cancellation prevents frontend updates; it does not guarantee cancellation of
provider work or charges already incurred.

The adapter in src/lib/reference-graph.ts filters a topic, namespaces node IDs by
graph, and draws each binary statement as an edge with direction and a relation label.
Visible nodes are the union of selected endpoints and complex participants, not topic-owned
concepts. Complex statements appear in cards with participants, evidence and evaluation
status; no fake binary edges are created. Topic changes reset selection to that topic.
Negation is shown in labels/details; conditions/formulas remain in the detail.
Parallel, reverse and self relations have distinct curves. Grid positions are
frontend-only; narrow graph containers use one column. Zoom/fit controls and the
keyboard-accessible relationship list provide access to larger graphs. Large,
dense graphs can still cross edges or need zooming; no graph-layout dependency
was introduced. The original backend graph is never mutated.

Source warnings and analysis warnings are retained. Evidence locations are shown
from their source blocks, never inferred as page 1 for text/DOCX. Ambiguous evidence
has no invented highlight. Summary and key-point links resolve source statement IDs.

## Verification

```powershell
npx tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/contracts/validate.mjs
node node_modules/typescript/bin/tsc -p tests/sources/tsconfig.json
node --test --test-isolation=none tests/sources/ingest.mjs
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/analysis/pipeline.mjs
npm run typecheck -- --incremental false
npm run build
# Install Chromium only if this Playwright version has no matching browser:
npx playwright install chromium
$env:PLAYWRIGHT_PORT = "3101"
npm test -- --workers=2
```

Default browser tests mock AI. PDF/DOCX cases use the real /api/sources endpoint
but mock /api/analysis, distinguishing extraction from live AI. All synthetic
transport data is confined to tests/ui-source-fixture.ts. Backend mock tests prove
mechanics and contracts; they do not establish model semantic accuracy.

Playwright cleans its default test-results output, including prior compiled test
files. Recompile tests/sources before running its HTTP suite after browser tests:

```powershell
node node_modules/typescript/bin/tsc -p tests/sources/tsconfig.json
# Separate terminal, after build:
npm run start -- --hostname 127.0.0.1 --port 3103
# Test terminal:
$env:SOURCE_API_BASE_URL = "http://127.0.0.1:3103"
node --test --test-isolation=none tests/sources/http.mjs
```

Explicitly opt in to one live UI request (the backend may make up to two AI calls):

```powershell
$env:PLAYWRIGHT_PORT = "3101"
$env:RUN_GEMINI_UI_SMOKE = "1"
npm test -- tests/source-analysis-live.spec.ts --project=desktop --workers=1 --retries=0 --output=test-results/live-ui
Remove-Item Env:RUN_GEMINI_UI_SMOKE
```

Live tests use the Next.js server configuration, not mocked endpoints. Keep ordinary
tests and live tests separate. No billing or account changes are performed.

Verification on 2026-10-10:

- Block 1: 64 passed; Block 2 ingestion: 47 passed; Block 3A mock/offline SDK: 50 passed.
- Production source-ingestion HTTP: 10 passed, including PDF/DOCX.
- Project typecheck and production build passed.
- Browser desktop/mobile: 28 passed; 2 opt-in live cases skipped in the default suite.
- One live UI attempt imported the short text successfully, then analysis returned
  HTTP 503 AI_NOT_CONFIGURED with the controlled message that credentials, model
  or structured-output configuration were rejected by the provider. It was not
  retried. No real SourceAnalysis success or model accuracy is claimed. The error
  did not distinguish invalid credentials, model access/ID, or rejected schema at
  the time. The [subsequent diagnosis](gemini-diagnosis.md) identifies the active
  invalid model ID and improves backend error classification. No live analysis
  success is claimed by that diagnosis either.
- The pre-existing next-env.d.ts change was preserved byte-for-byte. .env.local
  contents were neither printed, edited nor staged.

## Subsequent work

The subsequent [timeout diagnosis](gemini-diagnosis.md) reproduces upstream deadline
expiry on the real UI, raises the shared per-call deadline to 60 seconds and disables
automatic retries of provider failures. The opt-in live test now uses localhost,
checks hydration, uses the supplied photosynthesis text, and verifies topics/evidence
when real analysis succeeds. After the fix, real attempts hit 503 then 429; current
end-to-end graph/summary success remains unverified. Offline analysis tests: 63 passed;
typecheck passed. The earlier browser/mock/build results above are historical.

The historical source-only integration above has now been extended by
[Blocks 3B/3C](source-explanations.md): audioFile transcription, editable learner
text, explanation-file ingestion, real evaluation, status overlays and feedback
are implemented. The active clients now use the finalized stateless contracts.
The latest live verification used four total generations and reached both text
and voice feedback; details distinguish fresh source analysis from a replayed
saved real analysis in the resumed voice session. Earlier failures above are
historical, not the current readiness report.
