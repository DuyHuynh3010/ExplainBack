# Multi-section analysis investigation (2026-10-10)

The multi-section source still **does not pass live analysis** after this session.
Do not treat the offline repaired fixture or browser replay as a successful AI run.
The model, public contract, source content, timeouts and input/output limits were
preserved. No evaluation, voice or aesthetic UI changes were made.

## Confirmed failures

The older request `7b19a06a-ec85-40ec-8453-4ef7c4d54403` only had metadata available;
its exact invalid fields cannot be recovered or attributed retrospectively.
New calls used the exact supplied multi-section source, including its license and
source claims, with `gemini-3.5-flash-lite` and SDK retry attempts set to one.

| Real generation | Result | Validation evidence |
| --- | --- | --- |
| 1, direct capture | Gemini 200/STOP, 3,643 output tokens, 7.5 s | Draft shape passed. `$.statements[5].objectConceptId` (`stmt_6`) and `[6].objectConceptId` (`stmt_7`) referenced `concept_thylakoid_membranes` in `topic_chlorophyll`, while the statements belonged to `topic_stages`. |
| 2, UI initial | Gemini 200/STOP, 6,786 output tokens | Six reference issues: five cross-topic endpoints and one nonexistent endpoint; request `e94ee412-af02-427c-b698-69c271e69f23`. |
| 3, UI repair | Gemini 200/STOP, 4,614 output tokens | References repaired, but `$.statements[3].evidence[0]` (`st-4`) failed exact adjacent context matching. The quote was present; this was not the missing-quote branch. API returned 502 after 32.2 s. Raw draft capture was not enabled in the reused server, so the individual context values are unavailable. |
| 4, final UI initial | Gemini 200/STOP, 7,627 output tokens, 15.4 s | Five cross-topic endpoints at statement indices 9, 13, 14, 16 and 17 (`s10`, `s14`, `s15`, `s17`, `s18`); request `8e6bfd69-4f32-48cb-9ed4-51e90798f344`. |

A temporary ignored Node fetch preload atomically blocked the final request's
repair before network transport. Thus there were **four real generations**, despite
five SDK attempts. The final API 503 was the local budget guard mapped to
`UPSTREAM_UNAVAILABLE`, **not a Gemini 503**. No 429, quota error, truncation or
timeout occurred in these four upstream responses. The temporary guarded server
was stopped after verification; this is not a permanent product setting.

## Code changes and rationale

- `errors.ts`, `draft.ts`, `normalize.ts`: retain structured validation issues instead
  of discarding them for a generic message. Schema, evidence and final domain errors
  preserve paths/rules. Evidence distinguishes missing quotes from incorrect adjacent
  contexts. Existing strict validation is retained.
- `draft-references.ts`: report all known topic/endpoint/lesson reference failures
  before UUID mapping, with original draft IDs. Unknown references remain errors.
- `pipeline.ts`, `prompt.ts`: give the existing one repair the previous draft and
  concrete issues. Explain topic-local copies, actual subject/object meaning, atomic
  assertions and exact context adjacency. These instructions **were insufficient to
  guarantee a valid final live response**.
- `diagnostics.ts`, `handler.ts`: console diagnostics contain metadata only. Start
  a development server with `EXPLAINBACK_ANALYSIS_CAPTURE=1` to explicitly save
  source/draft/candidate/issues under ignored `test-results/source-analysis-artifacts/`.
  No key or SDK object is saved. Keep these source-bearing files local. There is no
  normalized candidate when reference preflight fails before construction; artifacts
  retain the draft and issues instead. If final domain validation fails, the candidate
  is retained. Production capture is disabled.

The v1 public graph still requires topic-local concepts. A shared concept may have
distinct IDs in different topics; references must use the appropriate local ID.
Normalization still does not guess, redirect or relocate endpoints to bypass errors.

## Offline and visual checks

- 228 offline tests passed: contracts, ingestion, analysis/provider, reference adapter,
  existing explanations and 11 new multi-section regressions. Project typecheck and
  production build passed. The pre-existing `next-env.d.ts` was preserved byte-for-byte.
- Regressions preserve both real failed drafts, exercise shared concept copies,
  unknown and cross-topic endpoints/lesson links, absent/empty/incorrect contexts,
  strict quotes, final domain errors, repair feedback and diagnostic isolation.
- A hand-repaired fixture changes two endpoints: a separate stage-local thylakoid
  concept and the actual stroma destination. It passes structural/domain validation
  and retains the whole document/license. This is **not** an AI repair success or a
  semantic ground truth fixture.
- One offline desktop browser test passed: all five topic summaries, node/edge
  counts, evidence details and switching back to the first topic. JSON adapter tests
  preserve every statement's endpoint IDs and direction. The live browser tests
  failed at API validation and never reached a real graph for this source.
- Manual inspection of replay images confirmed readable stage directions to
  thylakoid membranes/stroma, but small fitted labels and isolated ATP/NADPH nodes.
  The original draft also contains incorrect self-loops: photosynthesis to itself
  instead of its participants; chloroplasts to themselves instead of the plant cell.
  C4's four-carbon assertion incorrectly points to 3-phosphoglyceric acid. These
  semantic errors originated in extraction and remain in the structurally repaired
  replay. Quote verification proves a quote's source position, not graph meaning.

## Files and artifacts

Regression fixtures and entrypoints are under `tests/analysis/fixtures/multisection-*`,
`tests/analysis/multisection.mjs`, `tests/analysis/multisection-capture.mjs`,
`tests/multisection-live.spec.ts` and `tests/multisection-replay.spec.ts`.
Live scripts require explicit opt-in and must obey the remaining session budget.
They must not be included in automatic offline suites.

Ignored artifacts:

- `test-results/multisection/initial.json`: first raw AI draft and validation outcome.
- `test-results/source-analysis-artifacts/8e6bfd69-4f32-48cb-9ed4-51e90798f344-call-1.json`:
  final raw draft and five exact reference errors.
- `test-results/multisection/ui-live-first-fix.json`, `ui-live.json`: actual endpoint
  responses and safe diagnostic metadata; the latter identifies the local guard.
- `repaired-offline.json`, `ui-offline.json`, `offline-topic-*.png`: explicitly
  hand-repaired offline replay and screenshots, not live success.
- `all-regressions.log`: 228 passing offline tests.

Next work needs a fresh explicitly authorized live budget. Current evidence supports
improving extraction/repair reliability and auditing endpoint semantics; it does not
justify increasing timeouts, relaxing evidence checks or changing the public topic
contract. No successful live endpoint/UI result for this testcase is claimed.
