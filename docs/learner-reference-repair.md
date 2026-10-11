# Explanation reference and mixed repair

The public contract remains 2.0. Model, timeouts, output budgets, source analysis
and UI are unchanged. Evaluation still permits only one initial generation and
one scoped repair, with SDK attempts one.

`normalizeEvaluation` checks all learner binary endpoints and complex participants
before assigning opaque IDs. Only exact learner concept records resolve references.
A source record, matching name or alias never supplies a missing learner record.
Missing references report `missing_learner_concept`, the draft learner claim ID,
missing concept ID and exact field path. Relevant coverage/link problems are
collected even when unresolved endpoints prevent construction of a candidate.

`planScopedRepair` partitions representation/reference and alignment/coverage
issues and builds ONE bounded patch schema containing all needed sections:

- `concepts`: new learner records only, when representation repair is needed.
- `claims`: exactly the requested original IDs and their representations only.
- `comparisons`, `additionalIdeas`, optional `conceptAlignments`: only when
  link/coverage repair is needed, with exact selected source reference coverage.

The backend freezes all assertions, quotes, negated flags, conditions, formulas,
claim IDs, good representations, existing concept identities and source graph.
It never automatically classifies an orphan or corrects wrong learner knowledge.
New records/references are model decisions based on learner text; the backend
checks shape, exact IDs, quote occurrence/ranges and its existing representation
guards, not general semantic entailment. Whole-response validation runs again.
No-op, unresolved, malformed or locked-field-changing patches fail without a
third generation. Extraction-only patches receive no source catalog.

Optional concept alignments remain strictly validated. Normalization now removes
only existing-ID suggestions that fail `unsupported_concept_alignment`, records
safe diagnostics and revalidates the entire response before deciding on repair.
The same step runs after repair. Unknown IDs, duplicates and all mandatory graph,
claim/link/evidence errors remain blocking. Compare only receives supported
identities; the adapter is unchanged. See [controlled alignment fallback](optional-concept-alignments.md).

Literal representation guards now retain their rule IDs and safe messages in
diagnostics. `literal_object_mismatch` requires an aligned literal subject and
predicate with a mismatched object head, plus another canonical head, a target
displaced into a trailing clause, or a non-reflexive self-loop. Other lexical
mismatches remain review findings; these checks are not an entailment engine.

## Evidence and verification scope

The old requests `2572da86-12d2-4543-9883-9d94388cdb1f` and
`d85c97bb-ec66-4488-b215-7618c63f6cf0` have metadata logs but no saved raw
draft/patch in the inspected artifacts. Their exact endpoints/assertions and the
42-token patch cannot be reconstructed. Code confirms why missing learner
references were ineligible and why the previous mixed planner repaired only
representation. Synthetic fixtures reproduce those branches; they are not the
old drafts. Stable rule IDs prevent new failures from losing the specific guard.

Existing opt-in development captures (`EXPLAINBACK_EVALUATION_CAPTURE=1`) record
raw initial/patch, draft, candidate, removed-alignment issues and validation issues
in ignored `.explainback-artifacts/evaluations/`, outside Playwright's output directory.
Console diagnostics include repair kinds, requested claim IDs and remaining
issues, never whole input, quotes or credentials. Capture is off by default and
disabled in production. Private captures must stay outside Git.

Offline regressions cover binary/complex unresolved references, correction to
existing learner IDs, missing coverage plus references, representation plus
unsupported alignment, frozen fields, no-op/malformed patches, fabricated quotes,
cross-domain fixtures and the unchanged successful biology response replay.
Passing mocks does not establish AI extraction/grading accuracy on arbitrary text.

## This verification session

- Initial offline run: 155 passed, one skipped; the saved real biology initial
  output and alignment patch replay passed unchanged through the new handler.
- Final expanded offline run: 219 passed, four skipped. Typecheck, production
  build and diff checks passed. Skips are unavailable private artifact cases.
- Synthetic mixed-repair browser replay: desktop and mobile passed. Explanation
  -> Compare, actual feedback and selected-edge/node highlights were checked.
  Every browser API was intercepted; this is not live AI verification.
- Live League evaluation reused a validated saved real source analysis and exact
  supplied explanation. One generation used the unchanged configured
  `gemini-3.5-flash-lite`. Gemini returned HTTP 504 `DEADLINE_EXCEEDED` after
  about 59.7 seconds (request `6c70b65d-69ba-4774-acbb-77dddbdaade0`). No draft,
  repair or semantic result was available. The persistent transport guard stopped
  further network requests. Total live generations: **one**, not four.
- Networking has not been verified live; no network calls followed the upstream
  timeout. No model, timeout or budget increase was made.

Verification incident: the first Playwright invocation used its default output
directory and removed ignored `test-results/` artifacts, including older private
captures and the initial run's local records. Those captures have not been
recovered. The original failing A/B drafts were already absent before this.
The subsequent browser run uses an explicit separate output directory under
`playwright-report/learner-reference-repair-output`, leaving diagnostic inputs
untouched. Real biology browser replay is explicitly skipped after this loss.
Safe live result/ledger metadata was reconstructed from completed tool output
with `calls: 1, stopped: true`; the budget was not reset. Source code, environment
file and the restored pre-task `next-env.d.ts` were not lost. The snapshot of
`next-env.d.ts` was restored immediately after each build before this cleanup.
