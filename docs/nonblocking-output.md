# Default nonblocking graph output

Lesson and Explanation use readable AI output without rejecting the entire response
for semantic quality. Compare uses the normalized evaluation already in session.
There is no strict/lenient option, new review banner, or fallback demo response.
API envelopes and graph fields remain version 2.0.

## Runtime behavior

`output-normalization.ts` is shared by source extraction, section checkpoints and
learner extraction. Its JSON reader retains readable fields/items preceding a
damaged tail; it never completes an unfinished string. ID-only fragments are not
claims. Empty text, unreadable JSON, and objects without graph fields remain errors.
An explicitly empty extraction remains empty; the backend does not invent knowledge.

- Existing unique IDs survive draft normalization. Missing, invalid and duplicate
  IDs receive deterministic IDs. Ambiguous references to duplicate IDs resolve to
  the first explicit record; later records remain separate. Document/attempt scoped
  response IDs are deterministic hashes. Labels/aliases never resolve identity.
- An exact catalog ID supplies its established record. A conflicting new record is
  retained separately, while references to the established ID keep that identity.
  Checkpoint normalization is idempotent and preserves completed statement IDs.
- Binary endpoints that resolve remain unchanged, even when their meaning conflicts
  with the assertion. Unresolved endpoints become complex content cards; only known
  participant IDs with readable roles get links. An empty participant list is valid
  for rendering a standalone assertion. No guessed endpoint replaces a missing one.
- Assertions, formulas, conditions, and supplied boolean polarity are retained.
  String boolean values are converted to booleans without inferring polarity from
  text. Output quality checks do not rewrite learner misconceptions.
- Quotes are retained even if the block is missing or the quote cannot be located.
  Only unique occurrences (possibly disambiguated by exact context) receive computed
  ranges/context. Unlocated evidence is unverified without fabricated offsets.
  Source details tolerate a missing source block.
- Topics and processed statements are retained. Invalid summary links are removed
  without dropping summary text. Missing summaries are not fabricated. Ingestion
  warnings remain unchanged; normalization does not add AI quality/review warnings.
  Existing evidence-based topic order is preserved; a concepts-only output can
  render isolated nodes without fabricated relationships.

Evaluation retains every readable learner claim, including those absent from all
comparisons/additional ideas. Existing All topics adapters display these as Not
compared. Usable comparisons preserve AI verdicts and explanations. Repeated source
IDs keep the first usable comparison. Unknown reference links are discarded; unknown
learner links are filtered, and a definite verdict with no usable counterpart is
discarded. No Correct verdict is manufactured. A valid comparison wins over duplicate
additional membership, without deleting the claim.

Optional concept mappings are retained only when both IDs exist and a linked
comparison supports their participation. Unknown, duplicate or unsupported mappings
are removed with internal metadata diagnostics. Compare retains separate identities
and never compensates with label matching. `uncertain` mappings do not merge nodes.

## Removed gates and retained boundaries

Analysis no longer invokes strict draft/reference/semantic/coverage/lesson-quality
rejection or output repair. Evaluation no longer invokes learner paragraph coverage,
claim classification, evidence/polarity/endpoint quality gates, or scoped AI repair.
There is one generation per requested analysis part/evaluation; no hidden retry.
Readable MAX_TOKENS output is recovered without accepting its incomplete strings.

Backend and browser now use the `validateDisplay*` functions for AI responses and
cached source analyses. These still check safe response shapes, unique IDs and
resolvable normalized graph links, as well as exact source/learner input binding.
Historical strict validators and repair helpers remain available for offline
diagnostics; they are not runtime modes or display gates.

Human input validation, document integrity, request/file/text limits, section planning,
source hash/call-budget checkpoint binding, provider configuration, cancellation,
quota, service failures and deadlines remain enforced. Transcription is unchanged.
Model, timeouts, dependencies and source output budget (16,384 tokens) are unchanged.

## Offline verification

The committed `tests/analysis/fixtures/nonblocking-output.json` contains seven
deliberately faulty synthetic cases, including a combined case. Browser tests invoke
real handler functions with injected providers and intercept all API traffic: they
exercise backend normalization, client response checks, adapters, ELK and UI without
calling Gemini. They are mock/replay evidence, not live semantic validation.

Two immutable historical multi-section extraction captures are also replayed offline
after a test-only v1→v2 field migration and positional block-ID translation. Assertions,
polarity, formulas and quotes are not corrected. This is not a new provider run and
does not recreate an unavailable recent request.

```powershell
npx tsc -p tests/analysis/tsconfig.json
node --test tests/contracts/validate.mjs tests/analysis/nonblocking-output.mjs tests/analysis/pipeline.mjs tests/analysis/explanations.mjs tests/analysis/topic-processing.mjs tests/analysis/alignment-sanitization.mjs tests/analysis/reference-graph.mjs tests/analysis/lesson-all-topics.mjs tests/analysis/compare-workspace.mjs
npm run typecheck
npx playwright test tests/nonblocking-output.spec.ts --workers=1 --output=playwright-report/nonblocking-output-browser
npm run build
```

The browser cases cover Lesson → Explanation → Compare, claim selection, highlight,
direct concept/edge-label/card clicks, details, topic/All topics switching and graph
fullscreen on desktop/mobile. Switching
views/topics makes no additional API request. Tests also retain quota/timeout/input
errors and ensure normalization does not mutate source or learner input. Generated
logs/screenshots/replay data are ignored under `.explainback-artifacts/nonblocking-output/`.

Existing tests that expected quality rejection/repair were updated to check retained
content, safe IDs/cards, untouched AI verdicts and one generation instead. Historical
strict diagnostic suites are not evidence of runtime AI success and were not all rerun.

Verification for this change: 206 offline tests passed, one optional saved-live
audit was skipped because its capture was absent; all 14 desktop/mobile browser
cases passed. Typecheck and diff checks passed. Production build passed against a
current-source snapshot in the ignored artifact directory, with no environment file
copied, to preserve the existing root `next-env.d.ts` byte for byte. There were zero
live AI generations. Some historical repair/strict-runtime suites still describe the
previous rejection behavior and need test migration before a full legacy suite run.

## Changed files

- Backend: `analysis/output-normalization.ts`, `analysis/normalize.ts`,
  `analysis/concept-catalog.ts`, `analysis/pipeline.ts`, `analysis/section-pipeline.ts`,
  `contracts/validate.ts`, `contracts/domain.ts`, `explanations/evaluation.ts`,
  `explanations/common.ts` under `src/backend/`.
- Client/details: `src/lib/source-analysis.ts`, `src/lib/evaluation.ts`,
  `src/lib/reference-graph.ts`, `src/lib/comparison-graph.ts`,
  `src/components/SourceEvidenceDetails.tsx`.
- Tests: `tests/analysis/nonblocking-output.mjs`, `pipeline.mjs`, `explanations.mjs`,
  `topic-processing.mjs`, `alignment-sanitization.mjs`, `reference-graph.mjs` in the
  same folder; `tests/nonblocking-output.spec.ts` and the synthetic JSON fixture.
- Documentation: this page and links in source analysis, source explanations,
  graph v2, and Lesson/Explanation/Compare documentation.

## Limits of this behavior

Normalization enables display; it does not establish semantic truth, extraction
completeness or reliable AI verdicts. Duplicate IDs do not contain enough information
to recover which occurrence the provider intended. Unresolved endpoints cannot yield
a meaningful binary edge, so their readable assertion remains a card. If the provider
returns no readable graph content, there is no graph to invent. No live AI generation
was performed for this change.
