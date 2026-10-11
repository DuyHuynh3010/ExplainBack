# Graph v2 verification — 2026-10-10

Status: architecture implemented and offline checks pass; **full live acceptance is
not established**. Four real generations were used, all with the configured
`gemini-3.5-flash-lite`. No model/provider, environment file, timeout, token ceiling,
dependency or lockfile was changed. No commit/push/merge/deploy was performed.

## Implemented behavior

Document-wide canonical concepts, binary/complex representations, backend-derived
evidence context, primary-topic views ordered by source evidence, complex statement
cards, exact-reference evaluation and independent learner claim ordering are in
place. Public contract is `2.0`; old sessions need reset/re-import. See
[contract and migration](backend-contract-v2.md) for API and consumer changes.

## Offline and browser checks

| Check | Final result | Evidence |
| --- | --- | --- |
| Contract, pipeline, provider transport, evaluation, adapter, old-artifact replay | 182 passed | `test-results/graph-v2/final-offline.log` |
| Text/PDF/DOCX ingestion | 47 passed | `test-results/graph-v2/ingest.log` |
| Production HTTP ingestion/analysis/errors | 15 passed | `test-results/graph-v2/http.log` |
| Desktop/mobile source session, retries/stale responses, explanation/voice mechanics | 52 passed | `test-results/graph-v2/browser-final.log` |
| Extended complex-card Partial feedback and exact source-ID reuse | 2 passed after fixing an ambiguous test heading locator | `test-results/graph-v2/browser-complex.log` |
| Typecheck | Passed | `npm run typecheck` |
| Next production build | Passed, all four API routes present | `test-results/graph-v2/build.log` |

Browser AI responses in these checks are explicitly mocked. PDF/DOCX ingestion
uses the actual local endpoint. Synthetic semantic verdicts test contract behavior,
not model accuracy. The complex-card screenshot was inspected: participants, Partial
badge and the source assertion are visible; the binary relation keeps a separate
Missing label. On mobile the fitted graph labels remain small. No layout polish or
new renderer was added.

The HTTP test server used whitespace-only process configuration (not `.env.local`)
to force `AI_NOT_CONFIGURED`. An initial empty-string PowerShell assignment removed
the environment override and Next reloaded local configuration; the exhausted
transport guard blocked that SDK attempt before network. Corrected HTTP tests passed;
the real-generation count remained four.

## Replay of original failures

Original JSON captures are unchanged. A test-only shape migration moves v1 endpoint
fields under `representation`; it does not fix meanings, IDs, quotes or participants.

| Saved issue | Current outcome |
| --- | --- |
| Valid concept reference across source topics | Reference preflight passes without cloning or redirecting |
| Unique quote with wrong adjacent context | Backend locates quote and derives actual context |
| Chloroplasts self-loop instead of plant cell | Concrete literal projection error with draft statement ID/path |
| Stroma replaced by thylakoid membranes in a trailing clause | Displaced-target error; no guessed remapping |
| C4 object replaced by a three-carbon compound from a later clause | Displaced-target error; no guessed remapping |
| ATP/NADPH orphan concepts | `UNUSED_CONCEPT` warning exposes incomplete relation coverage |
| `does not require` plus `negated: true` | Rejected affirmative-relation invariant; not blindly stripped |
| Repeated multi-agent assertion copied onto partial edges | Added collection-level conjunction regression; rejects the new real capture too |

The literal checker is conservative and incomplete. Paraphrase/coreference and
unrecognized relation syntax can produce review warnings instead of a semantic
verdict. Complex participants are validated structurally, not proven by entailment.

## Real generations and actual UI result

The source was the complete unchanged
`tests/analysis/fixtures/multisection-source.txt`, including the license. The local
Next server had SDK attempts one, at most one invalid-output repair per source
request, and a persistent transport guard capped this session at four actual calls.

| Generation | Upstream / finish | Result |
| --- | --- | --- |
| 1: source analysis through UI | 200 / STOP, 4,508 output tokens, about 8.9 s | Rejected: quote changed raw `light-*dependent*` into `light-dependent` |
| 2: automatic bounded repair | 200 / STOP, 4,696 tokens, about 8.8 s | Rejected: the same raw Markdown quote mismatch persisted |
| 3: analysis through UI after explicit raw-quote prompt clarification | 200 / STOP, 7,500 tokens, about 14.3 s | Passed then-current validation; 4 topics, 23 concepts, 26 statements (23 binary, 3 complex). Real graph/summary rendered. Inspection found remaining semantic errors below |
| 4: one explicit repair of captured semantic issues | 200 / MAX_TOKENS, 8,175 output tokens reported by provider, about 15.0 s | Truncated and rejected; no partial graph accepted |

Generation 3 copied “The process is carried out by plants, algae, and some types of
bacteria” onto three partial binary edges, substituted Chemical energy for sunlight/
light, used Plants for plant cell, omitted green color from a gives relation and
retained a C4 concept with no C4 statement. These are extraction errors already
present in the draft, not ID remapping or layout changes. HTTP 200 and verified
quotes did not establish semantic correctness.

The conjunction check added afterward now rejects generation 3, as verified by an
offline regression. Other lexical/semantic substitutions remain review limitations;
the final repair did not finish, so their correction is **not proven**. The browser
live test initially stopped on duplicated assertion labels in its selector; selectors
now use statement IDs. No new call was spent to repeat that browser test.

Artifacts (ignored by Git):

- `test-results/graph-v2/analysis-live.json`: first failed UI request and full source.
- `test-results/graph-v2/analysis-live-2.json`: generation 3 response before the new
  conjunction check; **not an accepted current-contract fixture**.
- `test-results/graph-v2/generation-{1,2,3,4}.json`: transport status/finish/usage.
- `test-results/graph-v2/final-repair.json`: unchanged captured draft, explicit audit
  issues, real repair output and truncation result; no hand-corrected output.
- `test-results/graph-v2/live-budget.json`: four calls; no 429 occurred.
- `test-results/graph-v2/complex-feedback.png`: synthetic mobile UI verification.

## Remaining acceptance gaps

1. Multi-section extraction still needs a complete live result that preserves all
   supported claims and accurate projections. The richer repair reached the existing
   output-token ceiling. A next task should decide how to reduce output duplication
   or partition extraction while preserving global identity, before increasing limits.
2. Evaluation with reordered text and contradiction is covered offline for binary
   and complex statements, but was **not run live** in this session. The budget was
   used to investigate and repair the source rather than grade against known bad data.
3. All topic switching, complex cards/evidence and status overlays pass synthetic
   browser tests. Live UI only reached the first source topic before audit stopped it;
   full live topic/evaluation acceptance remains unverified.
4. The existing grid can still produce small labels/crossings. It does not change
   endpoints; layout improvements are separate from these semantic issues.

`next-env.d.ts` retains its pre-task bytes and changes (SHA-256
`B8B3A344484B959AF5E4E3FC1A1609DAC3CB9ECE0CDEB6C145BE29BC4C491000`). Existing
uncommitted work was extended in place; no branch was switched.

The old `tests/audit/` v1 probes and reports are historical. They are not v2
fixtures; the v1 visual replay is skipped rather than silently treating old data as
current. Current regressions are listed in the v2 contract document.

## Files changed for v2

Production contract/extraction:

- `src/backend/contracts/domain.ts`, `validate.ts`, `synthetic-demo.ts`; new
  `graph.ts`, `statement-quality.ts`.
- `src/backend/analysis/draft.ts`, `draft-references.ts`, `evidence.ts`, `gemini.ts`,
  `handler.ts`, `normalize.ts`, `pipeline.ts`, `prompt.ts`.
- `src/backend/explanations/common.ts`, `evaluation.ts`.
- `src/backend/sources/handler.ts`, `normalize.ts` (versioned transport).

UI and clients:

- `src/components/AppShell.tsx`, `SourceEvidenceDetails.tsx`, `UnderstandingMap.tsx`.
- `src/lib/reference-graph.ts`, `source-analysis.ts`, `source-ingestion.ts`,
  `transcription.ts`. Existing React Flow layout is retained.

Current tests and diagnostic entry points:

- `tests/contracts/validate.mjs`.
- `tests/analysis/endpoint-fixture.mjs`, `pipeline.mjs`, `explanations.mjs`,
  `reference-graph.mjs`, `http.mjs`, `live.mjs`, `multisection.mjs`,
  `multisection-capture.mjs`.
- New `tests/analysis/global-fixture.mjs`, `legacy-artifact.mjs`, `live-budget.cjs`,
  `graph-v2-repair.mjs`, and `tests/graph-v2-live.spec.ts`.
- `tests/sources/ingest.mjs`, `http.mjs`; `tests/ui-source-fixture.ts`,
  `session.spec.ts`, `explanations.spec.ts`, `audio-container.spec.ts`,
  `voice-live.spec.ts`, `multisection-live.spec.ts`, `multisection-replay.spec.ts`;
  `tests/audit/visual.spec.ts` only gains an explicit incompatible-v1 skip.

Documentation:

- `README.md`; `docs/backend-contract-v1.md` (historical banner);
  new `backend-contract-v2.md`, `graph-v2-verification.md`;
  `source-analysis.md`, `source-ingestion.md`, `source-explanations.md`,
  `ui-source-analysis.md`.

Pre-existing diagnostics/errors, audit reports and raw multi-section fixtures were
retained. `api.ts` inherits the new `SchemaVersion` and domain types; no duplicate
endpoint type system was added. Package files and `next-env.d.ts` were not changed
by this task. All work remains uncommitted on `feat/source-analysis`.

The temporary guarded and unconfigured test servers were stopped. Ordinary
development mode was restored at `http://localhost:3000`; no further AI request was
sent. The persistent diagnostic ledger still records four actual generations.
