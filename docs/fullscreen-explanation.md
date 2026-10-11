# Native fullscreen and reordered math explanation investigation

## Implemented changes

The three graph views share `useGraphFullscreen`. Expand requests fullscreen on
the explorer container, including its controls, topic selector and evidence pane.
The hook follows `fullscreenchange`, provides Exit fullscreen and reports denied
requests. Unsupported environments use the viewport overlay. The same DOM remains
mounted, preserving topic, selection and viewport; expanding does not call AI.
Native Escape belongs to the browser; only the fallback intercepts Escape.

`ReferenceCanvas` enables wheel zoom without Ctrl, centered on the cursor, and
background drag to pan. Wheel events inside the canvas prevent page scrolling.
Panel/page scrolling outside the canvas remains available. Explicit Zoom and Fit
controls remain; fullscreen does not continuously fit the graph.

Evaluation now preserves an optional learner formula through schema and
normalization. Source and learner share the representation instruction and ID
remapping helper, preserving binary direction and every complex participant role.
Their provenance and task-specific evidence logic remain separate.

The evaluation output allocation is 16,384 tokens; audio remains at 8,192. This is
based on the captured first generation reaching MAX_TOKENS at the old 8,192 cap,
before all 33 comparisons were complete. Read-only SDK model metadata confirmed
the configured model supports a 65,536 output-token ceiling. No input limits,
model, environment file or public domain contract were changed.

The learner text comes before the reference catalog, with an explicit paragraph
list. A conservative check rejects a sentence-bearing paragraph with no claim
quote. Bare headings and unpunctuated text do not introduce a minimum input length.
This detects omitted paragraphs, **not completeness of every claim within a
paragraph, entailment, or semantic correctness**.

Only completed output with concrete learner representation errors can trigger
one scoped repair. The patch schema permits new concepts and `{id, representation}`
for exactly the failed claim IDs. Assertions, quotes, polarity, conditions,
formulas, unaffected claims, comparisons and additional-idea references remain
frozen. Full validation runs again after merging. This does not rewrite incorrect
learner knowledge or deterministically turn statements into complex cards.
Schema/evidence/coverage/comparison failures, truncation and provider errors do
not retry. The route allows at most two generations, logs the repair purpose and
shares one existing 60-second operation deadline. Transcription stays one call;
SDK retry remains one attempt. Server-side diagnostics can explicitly restrict
evaluation to one generation; browser clients cannot widen the budget.

## Exact case and real evidence

The unchanged 2,601-character LF explanation is in
`tests/analysis/fixtures/reordered-math-explanation.txt`. All four generations used
the same saved, validated real three-topic Lesson: Propositional logic,
Quantifiers, Sets and functions. No source analysis was regenerated.

| Generation | Transport/result | Actual application outcome |
| --- | --- | --- |
| 1 | 200, MAX_TOKENS, 8,175 candidate tokens, about 16.6 s | 502 AI_OUTPUT_TRUNCATED; JSON ended inside comparison 29 of 33. Complete captured claims also contained wrong endpoints. |
| 2 | 200, STOP, 7,657 tokens, about 16.4 s | 502 AI_OUTPUT_INVALID: `$.additionalIdeas[0].learnerClaimIds` was empty and `explanation` was empty. Graphs/trees/equivalence claims were omitted. |
| 3, through local UI | 200, STOP, 8,448 tokens, about 17.3 s | 502 AI_OUTPUT_INVALID at learner statement indices 6, 14, 15, 18, 21 and 23 (`representation.objectConceptId`). The raw draft also omitted both quantifier paragraphs. No accepted graph/Compare. |
| 4, one-call handler diagnostic after fixes | 200, STOP, 7,921 tokens, about 16.4 s | 502 AI_OUTPUT_INVALID: new omission check rejects `$.learnerParagraphs[6]` and `[7]`. Repair was explicitly disabled to respect the remaining one-call budget. |

Examples of confirmed raw draft mistakes: Proposition -> is -> Proposition for
“a proposition is a statement that is either true or false”; Intersection ->
contains -> Intersection for shared elements; Function -> assigns -> Function
for exactly one output per input; Bijection -> is -> Bijection for injective and
surjective. These originate in extraction, before remapping. Literal validator
errors are warranted in these examples, not evidence that layout caused them.
Other structures need semantic review; absence of a hard error is not endorsement.

No accepted real evaluation exists for this testcase. The two missing paragraphs
include the explicit “I am not sure whether” claim, so a structurally valid repair
of just the self-loops would still be insufficient. The combined extraction and
evaluation generation continues to omit learner content despite instructions.
An independent learner extraction/validation stage may be needed; it was not
introduced as an unverified broader redesign in this task.

The budget ledger is locked at **4/4** in ignored
`test-results/fullscreen-explanation/ai-budget.json`. Raw provider candidates,
safe diagnostics, HTTP error envelopes and the full input snapshot are also
ignored there. Portable invalid fragments/quotes are retained in
`tests/analysis/fixtures/reordered-math-invalid-draft.json`; they are clearly
labelled diagnostic real fragments, not successful evaluations or substitute data.

## Verification

- 263 offline tests passed across contracts, pipeline, topic/section processing,
  representation, evaluation/transcription, layout and budget guards; four tests
  requiring unavailable/accepted private artifacts were skipped.
- 14 browser regressions passed on desktop/mobile; two opt-in live cases were
  skipped in the final offline run. All endpoint results in these 14 tests are
  mock/synthetic data, not live semantic proof.
- Native `document.fullscreenElement`, button exit, external API exit and state
  sync passed in all views; fallback Escape, denial, selection/topic/viewport
  retention, wheel anchor, zoom buttons, pan, panel/page scroll and cached view
  changes also passed. Screenshots were inspected.
- Chromium headless shell did not natively scroll the fullscreen evidence panel;
  full Chromium did. The dedicated test uses full Chromium. CDP/Playwright Escape
  did not exit native fullscreen in either headless executable. Tests exercise
  external `exitFullscreen` plus fallback Escape; **physical native Escape still
  needs manual verification in an interactive browser**. No application Escape
  workaround was added to pretend that browser behavior was tested.
- Typecheck, production build and diff checks passed. Sandbox worker/spawn
  restrictions were resolved by rerunning build/budget tests outside the sandbox.
  An initially misclassified opt-in live script refused execution before network;
  it was excluded from the corrected offline-only batch.
- No fixture fallback was added. The exact live test failed and retained the
  source/explanation UI input; the final result is not reported as live success.

## Files touched in this task

- Fullscreen/rendering: `src/lib/use-graph-fullscreen.ts`,
  `src/components/UnderstandingMap.tsx`, `ReferenceCanvas.tsx`,
  `ExplanationGraphView.tsx`, `src/app/globals.css`.
- Shared extraction: `src/backend/analysis/representation-instruction.ts`,
  `draft.ts`, `prompt.ts`, `normalize.ts`, `src/backend/contracts/graph.ts`.
- Evaluation: `src/backend/contracts/explanation-limits.ts`,
  `src/backend/explanations/evaluation.ts`, `common.ts`, `learner-repair.ts`.
- Tests: `tests/analysis/fullscreen-explanation.mjs`, the two reordered-math
  fixtures above, `tests/fullscreen-explanation.spec.ts`,
  `tests/graph-visualization.spec.ts`, `tests/explanation-overlay.spec.ts`.
- Documentation: this file. Existing work in these files was preserved.

No dependencies were added. No commit, push, branch switch or deployment occurred.
`.env.local` was untouched; `next-env.d.ts` retains its exact pre-task contents.

## Local verification

Run `npm run dev`. Import/analyze a Lesson, open its graph and Expand. Try wheel
zoom, background drag, evidence scrolling, view/topic changes, Exit fullscreen
and physical Escape. Normal source/evaluation actions can call configured AI;
view/topic/fullscreen changes should not.

For offline tests, first compile with
`node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json`, then run
the explanation-overlay and graph-visualization offline tests to generate their
synthetic browser fixtures. Against a local server, use:

```powershell
node --test --test-isolation=none tests/analysis/fullscreen-explanation.mjs
node node_modules/@playwright/test/cli.js test tests/fullscreen-explanation.spec.ts --workers=1 --output=test-results/fullscreen-explanation/browser-offline
```

Set `PLAYWRIGHT_PORT` for a different port. Do not reuse/reset the exhausted live
ledger or enable the live flag without a separately authorized generation budget.

Implementation references: [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen),
[React Flow interaction props](https://reactflow.dev/api-reference/react-flow),
[Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).
