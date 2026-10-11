# Reference and evaluation coverage stability

This change retains graph/API schema 2.0, the configured model, all timeout and
output budgets, UI behavior, source evidence validation, and the existing call
ceiling. It does not add storage or a provider dependency.

## Exact concept resolution

`analysis/concept-catalog.ts` owns canonical identity and resolves endpoint and
participant IDs. A referenced concept missing locally is materialized only when
its exact ID exists in the validated catalog of completed parts from the same
source checkpoint. No name matching, invented record, or endpoint substitution
is performed. Local name/symbol conflicts still fail; established aliases remain
canonical. Inputs and catalog records are cloned rather than modified.

Part checks, namespace/remap, checkpoint validation, merge and normalization use
this resolver. Prompts no longer require repetition of established catalog records.
Unknown IDs report `missing_concept`, the exact endpoint/participant path,
statement/concept IDs and `catalogFound: false`.

## One shared evaluation repair

`explanations/alignment-repair.ts` accepts coverage and classification/alignment
reference failures. The patch contains comparisons, additional ideas and optional
concept alignments only. Learner concepts and claims, assertions, quotes, formulas,
polarity, conditions and the entire source graph stay frozen. Frozen-field
injection, changed selected reference IDs and incomplete coverage are rejected.
The model decides where an orphan belongs; backend does not automatically label
it correct or additional. All existing validators rerun after merging the patch.

The existing two-generation ceiling means one initial generation plus **one**
repair shared by all failure types. A single scoped patch now handles eligible
learner reference/representation and alignment/coverage failures together. If
validation still fails afterward, the API returns an explicit failure; it does
not call a third time. Evidence,
malformed schema and omitted learner paragraphs do not become alignment retries.
Provider failures, truncated output and quota errors never trigger these repairs.

## Diagnostics and local capture

Known failure rules have stable internal rule IDs, safe fixed messages, field
paths and relevant IDs. Coverage includes the original learner draft claim ID.
Console diagnostics do not copy source text, quotes or arbitrary error messages.
The existing public `{path, message}` error-details shape carries these diagnostics;
no public schema version change was required.

Captures are development-only and explicitly opt-in:

- `EXPLAINBACK_ANALYSIS_CAPTURE=1`: `test-results/source-analysis-artifacts/`
- `EXPLAINBACK_EVALUATION_CAPTURE=1`: `.explainback-artifacts/evaluations/` (outside Playwright output)

They contain input, raw draft/patch, candidate when constructed, and validation
issues. They contain document text: keep them local. They are disabled by default,
never save SDK/key data, and are ignored by the `test-results/` and
`.explainback-artifacts/` rules respectively.
Capture failures do not affect endpoint behavior.

## Verification

Offline checks cover exact binary/complex catalog reuse, unknown IDs, identity
conflicts, immutable checkpoint resume, and a separate networking fixture.
Evaluation checks include orphan-to-comparison, outside-source additional ideas,
wrong and modal claims, formula/quote preservation, invalid alignment, locked-field
injection, unfinished repair and the shared two-generation ceiling. Unchanged live
artifacts are replayed with injected providers, without additional network calls.
The final offline run passed 214 tests, with one unavailable saved-artifact case
skipped. Typecheck and production build passed.

The authorized live session used exactly **four** generations, unchanged
`gemini-3.5-flash-lite`, SDK attempts one. All four returned HTTP 200 / STOP:

| Input | Result | Generations |
| --- | --- | --- |
| Supplied biology explanation with compatible saved real source analysis | Local evaluation HTTP 200; 8 learner claims, 13 comparisons. Initial omitted 3 reference comparisons; alignment patch completed them and preserved all learner concepts/claims. | 2 |
| Complete supplied esports lesson | Local ingestion 200; analysis 200, 3 topics and 27 statements. Initial referenced unknown concept `roam`; one scoped statement repair corrected it. | 2 |

Request IDs: biology `7ac8f774-f4f7-4432-bb8e-d8b3cf5bf4cb`; esports
`89c1afaf-6c6a-485c-a640-fb6255c7d220`. Evidence is stored locally in
`test-results/reference-stability/`, including the persistent call ledger and
unchanged generated candidate content. The source analysis was not repeated for
biology. No provider/quota failure occurred; no further live calls were made.

These were real local API tests, not a new browser/UI verification. Live esports
used one technical part containing three topics; cross-part catalog materialization
was verified offline, not by this live input. The original failed request drafts
are still unavailable, so these are new reproductions rather than replay of those
old requests. Successful validation is not a general AI semantic accuracy result.
