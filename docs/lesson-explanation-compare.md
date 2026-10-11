# Lesson, Explanation and Compare

[Default nonblocking graph output](nonblocking-output.md) now retains readable AI
claims despite quality issues. Unclassified claims appear as Not compared; invalid
optional concept mappings are removed rather than blocking the response. View,
layout, selection, fullscreen and cached topic switching behavior below is unchanged.

The graph explorer now has three distinct views. Lesson displays the neutral source
graph and summaries. Explanation displays only statements actually extracted from
the submitted learner text. Compare builds one combined graph and runs one ELK
layout, retaining both provenances and original assertions/evidence.

## Request, contract and session

The existing `POST /api/evaluations` already returns a complete `learnerGraph`,
learner document, verified quote ranges, comparisons and additional ideas. One
generation prepares both the explanation graph and comparison. Creating the graph
stores that complete response in React session state; Compare opens the cached
result. View/topic changes, selection, zoom and reopening unchanged explanation
text do not call AI. Editing input, replacing audio, changing the source or resetting
invalidates the result and aborts stale work. A failed request retains input and
the existing lesson for retry. Transcription is unchanged; edited transcript text
is still the submitted explanation. No database or persistence was added.

Contract version remains `2.0`. This additive capability adds optional
`EvaluationResult.conceptAlignments`:

```ts
{
  learnerConceptId: string;      // normalized learner concept ID
  referenceConceptId: string;    // exact existing lesson concept ID
  status: "matched" | "uncertain";
  explanation: string;
}[]
```

The provider supplies contextual semantic candidates in the same generation,
using aliases, assertions, roles, polarity and conditions. Backend validation checks
IDs, uniqueness per learner concept and support from linked comparison statements.
It does not prove semantic equivalence. `matched` identities may share positions;
uncertain/unmatched identities stay separate. Normalization discards only
existing-ID optional suggestions without a supporting
linked comparison, then validates the full result again. Unknown IDs and other
mandatory errors are not discarded. See [controlled fallback](optional-concept-alignments.md).
Historical v2 responses without
this field remain valid and never acquire label-based inferred alignments.
All comparison verdicts still join by stable reference statement IDs, not topic
or sentence order. Reference graphs are never regenerated for evaluation.

## Rendering and feedback

- The explanation adapter uses only the independent learner graph, including
  incorrect/negative/modal claims and additional ideas. It never fills missing
  oxygen or replaces "absorbs green" with the lesson's "reflects green".
- Topic selection filters learner statements through comparison references. All
  topics shows the full learner graph; Additional ideas shows unmatched claims.
- Explicitly aligned concepts share a node, carrying original IDs and labels from
  both graphs. Distinct concepts do not merge because their labels resemble each other.
- A correct one-to-one claim can share a rendered relationship only when its
  representation, aligned endpoints/roles and polarity agree. Its data retains
  both statement refs/assertions. Partial/contradicted/uncertain claims keep separate
  relationships. Complex relation nodes never merge merely by participant overlap.
- Solid/dashed lines and text identify Both, Lesson, Not mentioned and Explanation
  only, alongside the five status labels. Undirected participant roles keep no
  arrow. Role connections do not increase claim counts or create new verdicts.
- Selecting a comparison highlights the relevant relationships on both sides and
  shows source evidence, learner evidence and reasons. A learner claim supporting
  multiple references is rendered once and can highlight for each comparison.
- Existing measured layout, topic cancellation, highlight, zoom, Expand/Escape
  and review notes are retained. The expanded view keeps all three view controls
  and its topic selector accessible. Large graphs still require pan/zoom; Fit graph
  is an overview and does not guarantee readable text at phone-width overview zoom.

## Validation diagnostics and observed failure

Structured-output and normalized-domain failures now retain controlled path/rule
diagnostics. Routes expose only safe field paths/rule names in `error.details`,
not raw provider errors, source text or secrets; the client shows them alongside
the preserved input. Schema bounds, IDs, exact quote ranges, coverage, polarity
and representation checks are still enforced.

The exact supplied testcase was attempted through the local browser using the
configured `gemini-3.5-flash-lite`. Three generations were used in total:

| Generation | Result |
| --- | --- |
| 1: lesson analysis | Provider 200/STOP, rejected a knowledge-classified heading/block without supporting statements |
| 2: existing bounded source repair | Provider 200/STOP; source response 200 and source graph visible |
| 3: learner extraction/evaluation | Provider 200/STOP, response 502 `AI_OUTPUT_INVALID` |

The third output contained `assertion: "Chlorophyll reflects green light."` with
`negated: true`, rejected at `$.data.learnerGraph.statements[3].negated`. It also
misrepresented "not sure whether" as a negative complex claim. Offline replay of
that unmodified real candidate reproduced the same sole validation issue. A
hand-edited diagnostic variant with an explicit negative assertion and retained
modal uncertainty passes validation; it is not a live result or production fallback.

The evaluation instruction now explicitly requires assertion/flag consistency,
provides generic contrast/negative examples and distinguishes uncertainty from
negation. Regressions cover both the rejected mismatch and faithful negative/modal
representations. The corrected prompt was **not** called live after the budget was
exhausted. Real end-to-end Explanation/Compare success is therefore unconfirmed in
this session. No validator was relaxed and no failed live response became a fixture
success. Raw local diagnostics remain ignored under `test-results/explanation-overlay/`.

## Verification and local walkthrough

Synthetic tests are explicitly test-only and do not establish model accuracy.
Final checks: **229 offline tests passed**, three live diagnostics skipped;
**70 desktop/mobile browser tests passed**, six opt-in live cases skipped;
typecheck, production build and diff checks passed. Total actual AI generations:
**3**, exactly the two source calls and one failed evaluation described above.
They cover reordered topics, correct candidates, partial specificity, explicit
contradiction, missing oxygen, uncertainty, additional ideas, original IDs/quotes,
one layout, stable selection, combined provenance and cached Compare. Browser
fixtures exercise desktop/mobile and retain the existing source/file/audio/retry
flows. Screenshots include `explanation-*.png`, `overlay-graph-*.png`,
`contradicted-*.png` and `additional-*.png` under the
ignored diagnostics directory. The real failure screenshot/report is saved
separately; it must not be presented as a live comparison success.

Run `npm run dev` with Node 22+, then open `http://localhost:3000`. Paste the supplied
Photosynthesis/Food chains/Chlorophyll lesson and Continue. Select Write your
explanation, paste the supplied reordered explanation and Create explanation graph.
Inspect its independent claims, then select Compare. Choose Chlorophyll and select
the green-light relationship to inspect opposing assertions/evidence. Try Lesson,
Explanation, topics, Expand/Escape and Edit and try again. Creating a new graph
calls the configured provider; changing views and reopening unchanged text does not.

Offline verification:

```powershell
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/analysis/explanation-overlay.mjs tests/analysis/explanations.mjs
npx playwright test tests/explanation-overlay.spec.ts tests/explanations.spec.ts --output=test-results/explanation-overlay/browser
npm run typecheck
npm run build
```

Use a separate Playwright output directory so it does not clear the generated
offline fixtures. `PLAYWRIGHT_PORT` selects another running local server port.

## Files specific to this follow-up

Contracts/backend: `src/backend/contracts/domain.ts`, `validate.ts`,
`src/backend/analysis/draft.ts`, `src/backend/explanations/evaluation.ts`, `common.ts`.
No new endpoint, dependency, model or transcription algorithm.

Adapters/client: new `src/lib/comparison-graph.ts`; `src/lib/reference-graph.ts`,
`evaluation.ts`, `use-explanation.ts`.

UI: new `src/components/ExplanationGraphView.tsx`; `AppShell.tsx`,
`UnderstandingMap.tsx`, `RecorderPreview.tsx`, `ReferenceCanvas.tsx`,
`KnowledgeNode.tsx`, `src/app/globals.css`.

Tests: new `tests/analysis/explanation-overlay-fixture.mjs`,
`explanation-overlay.mjs`, `tests/explanation-overlay.spec.ts`; updated analysis
compile configuration, explanation/session/visualization tests and existing
optional live/replay selectors for the new Create graph -> Compare flow.

The earlier uncommitted visualization files and dependency changes remain intact.
Environment files, the existing `next-env.d.ts` content and Git history are preserved.
