# Discrete-math analysis investigation

The provided complete lesson is preserved in
`tests/analysis/fixtures/discrete-math-source.txt`. This task keeps contract 2.0,
collection/input limits, canonical IDs, evidence location rules, checkpoints,
evaluation/voice, graph layout and the configured model unchanged. Existing local
changes were retained. No dependencies were added.

## Confirmed failures and changes

The old response with message `Extraction contains inconsistent
assertion/representation data` was not saved locally with its draft. Its exact
statement/rule cannot be established from the message alone. The new capture is a
different failure, not evidence that the old response was caused by a heading.

| Evidence | Layer | Change / outcome |
| --- | --- | --- |
| New real capture: Gemini 200, STOP, 6,486 output tokens; draft schema passed, then `$.blockDispositions` failed for heading-only block `Propositional logic` (`f9255989-107f-485b-b4d3-5ba96a508481`). AI classified it as knowledge but supplied no supporting assertion/evidence. | Extraction disposition, enforced by normalization | The prompt now explicitly classifies standalone headings as `other`. A heading containing substantive body content still requires extraction. Coverage validation stays strict. |
| `planSourceParts` treated `For finite sets, the inclusion-exclusion formula is:` as a fourth semantic section. | Deterministic section planning | Plain colon-terminated introductions stay inside the current section. Explicit Markdown headings still work. The complete lesson now has three topics, two technical parts, and every original block once. |
| Synthetic assertion `Sensor transmits data while enabled.`, Sensor → transmits → Data, conditions `["While enabled"]`, failed at `$.statements[0].representation`. | Literal representation heuristic | A verbatim trailing while clause already retained in conditions produces a review finding rather than an omitted-clause error. Conjoined objects, production clauses, wrong endpoints/polarity and unretained while clauses remain blocked. This is a confirmed independent false positive, not proof of the old session's cause. |

The prompt also distinguishes asserted false values and NOT operators from denial
of the represented claim. Complete formulas/quantifier operands must remain in the
representation; a formula field cannot excuse incompatible endpoints. Properties
and missing objects must not become placeholder self-loops. These instructions do
not constitute deterministic semantic validation.

## Offline replay and validation

The raw failed capture is unchanged and ignored. Its schema and representation
checks pass, but normalization rejects unsupported heading coverage. A **manually
modified diagnostic variant** changing only heading dispositions passes while
retaining every statement; this isolates the coverage failure. That variant was
never used as an API success or UI fallback.

Synthetic regressions cover complete NOT expressions, equivalence, false values,
exactly-when conditions, qualified denial, quantifiers, complex roles/formulas,
explicit headings, wrong polarity/endpoints, missing objects and incomplete formulas.
IDs, references, evidence/quotes/ranges and lesson link validators remain unchanged.
Private raw replay cases are skipped when local captures are absent; the permanent
synthetic regressions run independently of those captures.

## Actual live receipts and remaining semantic issues

The session used exactly **four real generations**, all with configured
`gemini-3.5-flash-lite`; SDK attempts stayed at one. The persistent transport ledger
includes the initial diagnostic capture, both technical parts and the last scoped
repair. Browser retries were zero. No source analysis was run on topic switching.

| Generation | Actual result |
| --- | --- |
| 1, initial diagnostic capture | Upstream 200/STOP; rejected for unsupported heading coverage. Automatic repair was deliberately blocked in the diagnostic wrapper; no second network call was made. |
| 2, first UI part after initial fixes | Upstream 200/STOP, 6,148 output tokens; accepted Propositional logic and Quantifiers checkpoint. |
| 3, second UI part | Upstream 200/STOP, 4,154 output tokens; complete source response accepted: 3 topics, 26 concepts, 33 statements, 32 evidence records. |
| 4, explicit scoped repair after manual semantic audit | Upstream 200/STOP, 6,507 output tokens; rejected because affected lesson statement links were removed. No repaired graph was accepted or substituted. |

The genuine UI response successfully renders graph, summaries and evidence, and
switches 1 → 2 → 3 → 1 without more analysis requests. This establishes the working
data flow and structural validation, **not** a fully faithful semantic graph.

Manual inspection of that response found remaining extraction mistakes:

- `The implication p implies q is false exactly when p is true and q is false.`
  became Implication → is → Truth value with `negated: true`. That is not a faithful
  affirmative claim of a specific false value.
- `This operation is not generally symmetric.` became Difference → is → Difference.
  `Different inputs are allowed to have the same output.` became Function → allows →
  Function. Both are placeholder self-loops, not supported reflexive assertions.
- De Morgan equivalences became De Morgan's law → states → Conjunction/Disjunction,
  despite complete formulas in separate fields. Those endpoints do not express the
  complete equivalences.

These mistakes are already in the raw AI drafts. Normalization and the adapter
preserve their endpoints; layout did not create them. Most are review-only under
the current conservative heuristic. A verified quote proves source location, not
semantic correctness.

The final scoped repair targeted the actual saved statements with the existing
repair mechanism, retaining unselected claims. It failed at
`$.lessonSections[0].statementIds` (13 expected, 9 returned) and
`$.lessonSections[2].statementIds` (13 expected, 4 returned): the model omitted
links to unselected good claims. The strict merge guard rejected the patch. Neither
links nor assertions were fabricated to manufacture success. Final prompt changes
about faithful truth values/formula endpoints/self-loops have therefore **not** been
validated in a newly accepted complete live UI run. Further live verification
requires a new explicitly authorized budget; this session's ledger is closed.

## Checks and local artifacts

- Related contracts, analysis, evaluation/transcription compatibility, adapters and
  regressions: **248 passed, 3 private historical captures skipped**.
- Project typecheck, production build and diff checks passed for the final code.
- Final desktop/mobile browser mocks: **36 passed, 4 opt-in live cases skipped**;
  they cover graph/summary/evidence, three topics,
  checkpoint retry, reset, late responses and PDF/DOCX ingestion. The separate
  real desktop run passed before the final semantic-prompt extension.

Ignored `test-results/discrete-math-analysis/` contains the persistent call ledger,
raw provider outputs, complete source/request, actual UI/API responses, screenshots,
raw rejection replay, semantic repair/link diff and response → adapter graph trace.
No credentials are captured. Never commit that directory. Playwright must use a
subdirectory output path so it does not erase these captures:

```powershell
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/analysis/discrete-math.mjs
npm run typecheck -- --incremental false
npm run build
# Offline browser tests, against a local server:
npx playwright test tests/discrete-math.spec.ts tests/topic-processing.spec.ts tests/session.spec.ts --workers=1 --retries=0 --output=test-results/discrete-math-analysis/browser
```

The live test requires `RUN_DISCRETE_MATH_LIVE=1` and an independently enforced,
explicitly authorized server-side budget. Do not reuse/reset the closed ledger to
make another call. Start the web normally with `npm run dev`; paste the full lesson,
Continue, then choose Topic on the Lesson view. Review the full assertion/evidence
and warnings rather than assuming every visible edge is semantically verified.

Changes in this task: `analysis/prompt.ts`, `analysis/sections.ts`,
`contracts/statement-quality.ts`, the discrete-math source/regression/browser tests,
and this document. Existing Lesson/Explanation/Compare and visualization changes
were not replaced. No commit, push, branch change, secret edit or staging was done.
