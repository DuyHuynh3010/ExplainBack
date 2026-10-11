# V3 audit — 2026-10-10

## Scope and provenance

Branch: `feat/source-analysis`; no merge was in progress. The initial tracked worktree
change was `next-env.d.ts`. Its SHA256 remained
`B8B3A344484B959AF5E4E3FC1A1609DAC3CB9ECE0CDEB6C145BE29BC4C491000`.
No production code, UI styling, limits, dependency, environment file or Git history
was changed. Only this report and `tests/audit/` were added. Generated artifacts are
under ignored `test-results/v3-audit/`.

Read: AGENTS, README, team-rules PDF contents, backend contract, source ingestion,
analysis, explanations, UI integration and previous diagnosis/graph audit documents;
the installed Next.js route-handler and Playwright guides; current handlers,
validators, normalization, provider, clients, state hooks, graph adapter and renderer.
Some older UI documentation still describes transcription/Evaluate as unavailable;
current AppShell and endpoints enable them. The code was used as the current truth.

Live inference used the installed adapter and production handlers in a separate
Node diagnostic process loading the same local development environment with
`@next/env`. It did not instrument or modify Next routes. Model:
`gemini-3.5-flash-lite`; key present, never printed. Four sequential generations,
SDK attempts=1; a test-only provider guard blocked any analysis repair before an
SDK call. Thinking remained the model/SDK default. No further live calls were made.

Browser graph/feedback checks replayed **saved real responses** through Playwright
route interception. They prove rendering and client behavior for those responses,
not a newly successful live HTTP inference. Long PDF/DOCX checks used the actual
local `/api/sources` and `/api/analysis` routes and failed validation before AI.

## Findings

| Issue | Reproduced? | Evidence | Cause/layer | Smallest proposed follow-up |
| --- | --- | --- | --- | --- |
| Short explanations require more words | No length minimum reproduced | One-character UI input enables Evaluate; the 31-character meaningful sentence passed live with one correct and five missing | Only nonempty text is required. Busy/recording/pending explanation file also disable the button. The old rejected attempt was not available | Preserve short explanations; obtain its exact error/state before claiming another cause |
| A small PDF/DOCX fails analysis | Yes, offline and real local HTTP/UI | PDF 643 bytes and DOCX 36,214 bytes import with 200, then analysis returns 413 | Separate 20,000-unit original/normalized source ceiling or 120-block ceiling, not the 3 MB upload limit | Clearly explain the two budgets at upload and after extraction; decide larger-source strategy separately |
| Correct paraphrase fails | Yes, live | Upstream 200/STOP, API handler 502 AI_OUTPUT_INVALID; four optional context strings are empty | Gemini JSON Schema accepts empty strings; `matches()` requires every string to be nonempty | Align semantics for optional context only, e.g. omit empty contexts while retaining quote/reference validation; add regression. Not implemented in this audit |
| Wrong electron claims become Contradicted | Yes, live | Two contradicted reference IDs with exact learner quotes and verified ranges; four missing | Classification follows explicit opposite source assertions in this sample | Retain tests and inspect source graph integrity first; not proof of general grading quality |
| Wrong/incomplete graph relations | Yes, live draft | `water -> is -> water`, `carbon dioxide -> is -> carbon dioxide`, one multi-assertion edge, isolated photosynthesis | Extraction chooses bad endpoints/atomicity; structural validation accepts them. Normalization/adapter preserve them | Improve extraction contract instructions and semantic checks using assertion + evidence; reject/flag inconsistency rather than guess new endpoints |
| Small graph text, overlapping labels and paths through nodes | Yes, actual browser rendering | Desktop effective node/edge fonts 7.50/6.25 px; mobile 2.24/1.87 px; measured overlap and unrelated-node crossings | Fixed grid, fixed canvas height, whole-graph fitView and no node/label obstacle routing | Coordinate a readable initial viewport and graph-aware layout/routing after data correctness |
| Native input loses excess characters | Yes, browser insertText | Inserting 100,001 source units retains 100,000; 10,001 learner units retains 10,000, without an error alert | HTML maxLength blocks excess native input | Make over-limit input handling explicit rather than silently accepting a clipped input; do not increase limits without deciding policy |

The native input check uses Chromium `insertText`, not an actual clipboard paste.
Backend ingestion does not silently truncate: accepted source content is retained
in original/normalized segments and blocks, and oversized input is rejected.

## Limit inventory

Characters below mean **UTF-16 code units**, not words, Unicode code points, bytes
or model tokens. Byte counts are actual streamed UTF-8 JSON/multipart sizes.
Inventory paths below are relative to `src/`.
The active source and explanation file inputs override DocumentUpload's unused
default of 10 MiB/doc/gdoc with PDF/DOCX and 3,000,000 bytes.

| Limit/gate | Unit and value | Applied at file:line | Error/status and user-visible behavior |
| --- | --- | --- | --- |
| Source title | 200 UTF-16 | components/SourceInput.tsx:26; backend/sources/normalize.ts:10 | UI maxLength; server 413 PAYLOAD_TOO_LARGE, `Title exceeds 200 UTF-16 characters.` |
| Source text | 100,000 raw and normalized UTF-16 | components/SourceInput.tsx:28; backend/sources/ingest.ts:11; backend/sources/normalize.ts:57,88 | UI maxLength; server 413 PAYLOAD_TOO_LARGE, `Source text exceeds 100,000 UTF-16 characters.` |
| Extracted PDF/DOCX text | 100,000 UTF-16 including extraction line breaks/page separators | backend/sources/pdf.ts:25; docx.ts:80 | 413 PAYLOAD_TOO_LARGE, `Extracted PDF/DOCX text exceeds 100,000 UTF-16 characters.` |
| Source/explanation upload | 3,000,000 bytes; PDF/DOCX | components/DocumentUpload.tsx:30,36; SourceInput.tsx:32; TranscriptEditor.tsx:5; backend/sources/ingest.ts:17 | UI `The file must be 3,000,000 bytes or smaller.`; backend 413 PAYLOAD_TOO_LARGE, `File exceeds 3,000,000 bytes.`; actual unsupported bytes 415 UNSUPPORTED_SOURCE |
| PDF pages | 30 physical pages | backend/sources/pdf.ts:14 | 413 PAYLOAD_TOO_LARGE, `PDF exceeds 30 pages.` |
| DOCX expanded archive | 10,000,000 total bytes, 5,000,000 per entry, 1,000 entries | backend/sources/docx.ts:15,37,49 | 413 PAYLOAD_TOO_LARGE, decompressed content/archive entry limit message |
| Source request | 3,065,536 bytes including overhead | backend/sources/handler.ts:19 | 413 PAYLOAD_TOO_LARGE, `Request exceeds the allowed body size.` |
| Imported block split | 2,000 UTF-16 per block | backend/sources/normalize.ts:36; analysis/pipeline.ts:19 | Split without dropping content; forged oversize block rejected as INVALID_REQUEST 400 |
| Analysis source | 20,000 raw **or** normalized UTF-16; 120 blocks | backend/analysis/pipeline.ts:18 | 413 PAYLOAD_TOO_LARGE, `Analysis supports at most 20,000 UTF-16 source characters and 120 blocks. No content was truncated.` |
| Analysis request | 1,000,000 bytes, JSON only | backend/analysis/handler.ts:11,23 | 413 PAYLOAD_TOO_LARGE, `Analysis request exceeds 1,000,000 bytes.`; wrong media type 415 |
| Analysis input semantics | Nonempty consistent ImportedSource; explicit-question-only blocked | backend/contracts/validate.ts:123,427; backend/analysis/pipeline.ts:15,22 | INVALID_REQUEST 400 or NO_EXTRACTABLE_KNOWLEDGE 422; no AI call |
| Source draft collections | 12 topics/sections, 100 concepts, 120 statements/block dispositions; 1–4 evidence/statement; 1–20 key points/topic; 20 aliases/concept and conditions/statement; statement links 1–120 | backend/analysis/draft.ts:46–60 | AI_OUTPUT_INVALID 502; one bounded output repair normally allowed, disabled in this live audit |
| Source and evaluation model JSON | 100,000 UTF-16 | backend/analysis/draft.ts:71; explanations/evaluation.ts:61 | AI_OUTPUT_INVALID 502, output-size message |
| Generated output | 8,192 output tokens/call | backend/analysis/limits.ts:12; contracts/explanation-limits.ts:9; analysis/gemini.ts:63 | MAX_TOKENS becomes AI_OUTPUT_TRUNCATED 502; incomplete output not returned |
| Model input tokens | No explicit application token-count gate | analysis/prompt.ts; explanations/evaluation.ts:44; analysis/gemini.ts:61 | Character/byte bounds apply; provider/model limits remain separate. No token equivalence inferred |
| Explanation input gate | Non-whitespace text; valid source and analysis; no word-count minimum | components/AppShell.tsx:57,72; components/RecorderPreview.tsx:39; backend/contracts/validate.ts:123 | Evaluate disabled if empty, busy, recording or pending explanation file; bad request 400 INVALID_REQUEST |
| Learner text | 10,000 UTF-16 | components/RecorderPreview.tsx:31; lib/use-explanation.ts:49; backend/explanations/evaluation.ts:40 | Native maxLength; file-import client `The explanation exceeds 10,000 characters...`; backend 413 PAYLOAD_TOO_LARGE |
| Evaluation source | 20,000 normalized UTF-16; 120 reference statements | backend/explanations/evaluation.ts:40 | 413 PAYLOAD_TOO_LARGE, `Evaluation exceeds the supported source/learner limits.` |
| Evaluation request | 1,000,000 bytes; full ImportedSource + SourceAnalysis + learner | backend/explanations/evaluation.ts:119; backend/explanations/common.ts:22 | 413 PAYLOAD_TOO_LARGE, `Request exceeds the supported byte limit.`; no generation |
| Evaluation draft collections | 120 claims/comparisons/additional ideas; 120 claim links/item; 20 conditions/claim; 10 suggestions/comparison | backend/explanations/evaluation.ts:16–26 | AI_OUTPUT_INVALID 502, `Evaluation does not match the structured schema or limits.` |
| Evaluation structural/evidence gates | Every selected reference once; each claim classified once; exact quote/range; missing has no learner claim | backend/explanations/evaluation.ts:66–113; backend/contracts/validate.ts:280–351 | AI_OUTPUT_INVALID 502; no repair; these are not semantic accuracy checks |
| Recording | 3,000,000 bytes; nonempty audio; 120 seconds when measurable | components/AudioRecorder.tsx; lib/transcription.ts:6; backend/explanations/audio.ts:7,97 | UI/client stops/rejects oversize; backend 413 PAYLOAD_TOO_LARGE; empty/malformed 400 INVALID_REQUEST. WebM duration may be unknown |
| Transcription request/output | 3,065,536 multipart bytes; 10,000 transcript UTF-16; language 2–24 letters/hyphens; 10 warnings each 500 characters | backend/explanations/transcription.ts:11,32 | Input 413 PAYLOAD_TOO_LARGE; bad output 502 AI_OUTPUT_INVALID; silence 400 with type-text alternative |
| Parser depth | WebM 8; M4A 6 | backend/explanations/audio.ts:43,71 | Malformed recording INVALID_REQUEST 400 |
| Time/call ceilings | SDK/AI call 60 s; analysis total 122 s and max 2 calls; evaluation/transcription one call; explanation client 70 s | analysis/limits.ts:13–18; gemini.ts:49; explanations/common.ts:43,50; lib/use-explanation.ts:28 | AI_TIMEOUT 504 or client timeout with input kept; analysis client has cancellation but no separate timer |

Route modules delegate to Node handlers and add no separate body/time limit.
No Next config defining another request limit exists in this checkout. Production
hosting limits were not audited and are not inferred from local tests.
Ingestion/evaluation clients display backend messages; the analysis client also
prefixes the error code. Server rejection never substitutes a demo graph.

## Boundary checks

Verified below/equal/above: source 100,000; analysis 20,000; blocks 120; title 200;
learner 10,000; PDF/DOCX files 3,000,000 bytes; PDF pages 30; each DOCX archive
guard; source/analysis/evaluation streamed request bytes; JSON output size and
draft collection bounds. Audio bytes and measured duration were also checked.
Ingestion block splitting preserves all content at 1,999/2,000/2,001 units.
Collection-only schema tests isolate bounds; they do not pretend repeated sample
IDs are valid graphs. Existing regressions cover identity, evidence and truncation.

A DOCX with 19,999 visible characters extracts as 20,001 raw units because Mammoth
appends two newlines. Normalized text is 19,999, but **analysis still rejects its raw
count**. A large whitespace suffix similarly exceeds the raw budget despite a
short normalized source. Both behaviors are reproducible, not provider failures.

Real evaluation bodies were 9,336 / 9,585 / 9,385 bytes for short/paraphrase/opposite
claims; resubmitting source/graph did not approach 1 MB. A deliberately inflated
contract-valid summary created a 1,010,812-byte request rejected before generation.
That stress case exceeds the normal model JSON-output ceiling and does not establish
that normal imported sources currently exceed the request budget. The original
long source that the user encountered was not available for exact attribution.

## Live semantic results

All four upstream calls returned HTTP 200 with STOP; no quota/overload or retry.
Ledger and raw drafts/responses: `test-results/v3-audit/*-live.json`, `live-ledger.json`.

| Generation | Handler status | Time | Output tokens | Result |
| --- | --- | --- | --- | --- |
| Source analysis, shared 308-unit source | 200 | 4,770 ms | 1,968 | 1 topic, 8 concepts, 6 relationships; graph problems below |
| Short meaningful explanation | 200 | 2,198 ms | 757 | Glucose storage correct; other five reference relationships missing |
| Full correct paraphrase | 502 AI_OUTPUT_INVALID | 4,678 ms | 2,177 | Semantic draft has six correct comparisons, but response fails structural string validation |
| Reversed electron-transfer explanation | 200 | 2,666 ms | 995 | Water/CO2 assertions contradicted; other four missing |

Paraphrase rejection is caused by `claims[0].contextBefore`,
`claims[1].contextBefore`, `claims[8].contextAfter`, `claims[9].contextAfter` being
empty strings. Omitting **only** those optional fields in an offline replay passes
all normalization/domain/quote/reference checks and yields six correct statuses.
This isolates a code/schema compatibility bug, not semantic rejection for using
different words. The successful replay is **not** a successful live API response.

Contradicted evidence quotes are exactly `water gains electrons` and
`carbon dioxide loses electrons`; their computed ranges select those strings in
the submitted input. Missing comparisons have no learner quote. The source
assertions support those verdicts, although their graph endpoints are defective.
The evaluation prompt requests uncertain on assertion/endpoint disagreement;
these actual outputs did not apply that graph-safety instruction to the self-loops.

## Remaining semantic cases: offline only

These hand-authored expectations were normalized against the **actual captured
reference IDs**; they test contract plumbing, not Gemini's grading behavior.
Reference order: sunlight; combined CO2/water/products assertion; water electron
loss; CO2 electron gain; glucose storage; oxygen release.

| Input | Expected fixture statuses in that order | Notes |
| --- | --- | --- |
| Missing ideas | correct, uncertain, missing, missing, missing, missing | Compound reference is defective and mixes inputs/products; fixture conservatively marks its incomplete match uncertain |
| Negation | missing, contradicted, missing, missing, missing, missing | Actual `does not produce oxygen` quote, negated preserved |
| Mixed correct/wrong | missing, contradicted, missing, missing, correct, missing | Wrong oxygen/CO2 substitution retained |
| Outside-source idea | missing, missing, missing, missing, correct, missing | Medicinal use becomes a separate additional idea without a correctness status |
| Added Partial fixture: `Glucose stores energy.` | missing, missing, missing, missing, partial, missing | Storage is present but the chemical-energy qualification is omitted; incomplete/overgeneralized under the configured Partial definition, not an absent assertion |

No one of the seven supplied inputs was forced to produce Partial. Separate
synthetic atomic graph fixtures exercise all seven plus this extra Partial example.
Ambiguous/repeated quote tests also check uncertain without fabricated positions.

## Graph chain and visual review

The real draft already contains the following topology. Normalization and the
frontend adapter retain every endpoint, relation, polarity and condition; no ID
remap error, concept merge/drop or direction flip was found in this response.

| Draft relationship | Assessment |
| --- | --- |
| Plants -> use -> sunlight | Supported, though photosynthesis remains an isolated concept |
| Plants -> use -> carbon dioxide | Assertion includes water and two products as well; not atomic, graph omits water-use and both production relationships |
| water -> is -> water | Does not represent oxidation/electron loss; no Electrons concept |
| carbon dioxide -> is -> carbon dioxide | Does not represent reduction/electron gain |
| glucose -> store -> chemical energy | Correct endpoints and direction |
| Plants -> release -> oxygen | Supported; destination survives in assertion |

8 draft concepts -> 8 normalized concepts; 6 draft statements -> 6 response edges.
All source quotes are verified occurrences. That does **not** validate the faulty
self-loops or compound assertion. The previous session's screenshot payload was
not recovered; these are new, captured evidence, not attribution of that old image.

Synthetic adapter regressions retain parallel/reverse edges, negation, isolated
nodes and both produced objects; unknown endpoints and cross-topic links are
rejected by existing normalization/contract tests. Binary v1 graphs can retain an
explicit compound participant concept; splitting jointly dependent conditions
must not turn a combined requirement into independent sufficient causes.

Actual Chromium viewport sizes: desktop 1440x1000, mobile 390x844.
`UnderstandingMap.tsx:50,64` selects a one-column grid on narrow canvases and
fits the entire graph; `reference-graph.ts:13` uses 290/190-unit spacing.
`globals.css:10–11` gives the reference canvas 420/340 px height and 10 px edge
labels. React Flow nodes start at 12 px. Zoom was 0.624675 desktop and 0.18705 mobile.
Desktop has one overlapping `use`/`is` label pair and the Plants-release-Oxygen path
crosses Carbon dioxide. Mobile has no overlapping label rectangles in this sample,
but three edges pass through unrelated nodes: the storage edge crosses Oxygen;
the long release edge crosses five nodes. Passing through a node does not change
the endpoint ID. This can visually suggest a wrong connection even with correct
adapter data. Screenshots and DOM/path metrics are saved as `graph-*.png` and
`visual-*.json`. Evidence selection and two Contradicted badges render correctly.

## Validation and reproduction

- Audit: **115 passed** (111 offline cases, 4 captured-response checks).
- Existing contract/ingestion/analysis/adapter/explanation regressions: **217 passed**.
- Browser audit: **6 passed**, desktop/mobile; saved real-response rendering,
  pending-file/short-input gates, native text limits and real long-source rejection.
- Typecheck passed. No full build was needed for diagnostic tests/report only.
- Initial browser assertions needed test-selector corrections (aside/article,
  Next route announcer, duplicate heading); these were test issues, not product fixes.

```powershell
python tests/audit/generate_fixtures.py
npx tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/audit/offline.mjs tests/audit/captured.mjs
npx playwright test tests/audit/visual.spec.ts --workers=1 --retries=0 --output=test-results/v3-audit/playwright
npm run typecheck -- --incremental false
```

Captured checks skip when live artifacts are absent; browser audit also skips
without them. Nothing generates AI implicitly. `tests/audit/live.mjs` requires
explicit RUN_V3_AUDIT opt-in; running it again starts a new paid audit, not an offline
reproduction. The current four-generation budget is exhausted.

## Proposed repair order — not implemented

1. Align optional context-field handling between provider schema and local draft
   validation, keeping all public quote/range/reference safeguards.
2. Address source extraction atomicity/endpoints and semantic safety before treating
   the graph as reliable reference topology. Use general rules, not photosynthesis
   hard-coding or cosmetic remapping; preserve joint participants/conditions.
3. Clarify short-input/pending-file states and upload-versus-analysis budgets;
   prevent unnoticed text clipping. Agree on any larger-source design separately.
4. Coordinate graph layout, obstacle routing and readable initial zoom with frontend.
   Do not obscure extraction errors with layout changes.
