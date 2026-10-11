# Complex participants and representation choice — 2026-10-10

Continuation on `feat/extraction-quality-v2`. Existing unstaged extraction-quality
work remains intact. Public contract 2.0, canonical document-wide concepts, evidence
location/provenance, evaluation, limits, model/provider, retry policy and layout are
unchanged. The only additional production edit is the extraction system instruction
in `src/backend/analysis/prompt.ts`.

## Where participants are preserved

The exact new live response reported by the user was not found in the saved local
JSON captures. Its assertion/card mismatch therefore cannot be traced to an actual
draft from that session. The historical v1 capture is not proof of this v2 case.

The inspected current path preserves every supplied participant:

- `AnalysisDraft` / `REPRESENTATION_SCHEMA` accept an array of `{conceptId, role}`;
  roles are not unique keys.
- `normalizeAnalysisDraft` maps each participant's concept ID and preserves its role,
  order and representation. It does not deduplicate by role or infer roles from text.
- `referencedConceptIds` and `toReferenceFlow` select all participant concepts for nodes;
  complex statements stay cards and never become arbitrary binary edges.
- `UnderstandingMap` and `SourceEvidenceDetails` render the entire participants array
  with `.map`, including multiple agents. There is no first-agent selection.

An intentionally incomplete synthetic draft remains incomplete after normalization;
the existing review warning does not populate roles or change representation. Complete
synthetic drafts show all three agents on both capture cards on desktop and mobile.
This locates the missing-information problem at extraction **if** the session JSON
matches the reported card; it does not confirm the unsaved session's draft. Existing
lexical review warnings are advisory, may be suppressed by a claim sharing evidence,
and are not exhaustive checks of participant roles or semantic coverage.

## Extraction decision rule

Read clauses and resolve supported antecedents first. Prefer binary when one subject,
relation and object, together with polarity/scope/conditions, preserve the claim.
Definitions containing `meaning` can produce linked name/action claims with the same
source quote. A sentence's length, noun count or number of actors is not the decision.
Independent actions can be split into complete binary assertions; genuinely joint
dependencies or essential additional roles remain complex. Never project a complex
claim using its first two participants.

For a retained complex claim, enumerate every essential actor with its actual role,
allowing repeated roles. Keep each actor's scope and all required input/output/carrier
roles. The prompt uses a logistics example; no biology-specific transformation was
added to normalization or validation. Prompt instructions guide AI reasoning and do
not constitute a deterministic guarantee of semantic completeness.

Intake can have independent binary projections without assigning air/soil to either
input. The joint input/location assertion remains intact separately. This follow-up
does not change the shared-location policy or infer individual pairings.

## Before/after claims

“Before” below is the user's reported output, not a recovered response. “Synthetic
after” is authored test data passed through the actual pipeline and UI, not live AI.

| Claim | Reported before | Synthetic after |
| --- | --- | --- |
| Capture sunlight to produce oxygen | Assertion names Plants/Algae/some Bacteria; card lists Plants only as agent | Complex lists all three agents plus Sunlight input and Oxygen output; scope preserved |
| Capture sunlight to produce chemical energy stored in glucose | Card lists Plants only as agent | Complex lists all three agents, Sunlight, Chemical energy and Glucose carrier; explicit storage claim retained |
| Water loses electrons | Complex | Binary Water → loses → Electrons; within-cell/process context retained |
| CO2 gains electrons | Complex | Binary Carbon dioxide → gains → Electrons; within-cell/process context retained |
| Plants take in water / CO2 | Complex | Two independent binary claims with process context; original joint air/soil claim retained |
| Most life / some types of bacteria | Existing scope improvement | Assertions/conditions keep qualifiers; canonical concepts are not cloned |

Non-biology regression: Teams, Volunteers and some Contractors share the agent role
in a joint cargo/trucks claim. A negated conditional Sensor relation stays binary.
Pump supplies Water/Coolant as independent binary claims with shared evidence and
the same condition. Tests do not require exact model node/edge counts or vocabulary.

## Verification

| Check | Result |
| --- | --- |
| Contract/analysis/evaluation/transcription/adapter compatibility and focused regressions | 207 offline checks passed |
| Focused biology/non-biology regression | 3 of the 207 checks; synthetic pipeline and deliberate incomplete draft |
| Desktop/mobile UI fixture/replay | 6 passed; 4 separately opt-in live cases skipped |
| Typecheck, production build, diff check | Passed |
| Live UI, first prompt revision | HTTP 200, one generation; graph/summary/details rendered |
| Live UI, final prompt revision | Gemini 200; draft rejected for fabricated quote text; no accepted final graph |

There were **two real generations total**, both using configured
`gemini-3.5-flash-lite`; SDK retry remains one attempt. No model/environment change.
The first opt-in test reused the user's already running dev server on port 3000,
so the test process's separate transport guard was not installed in that server.
The server log (`live-1-diagnostics.json`, request
`f6fa2cde-a2c4-4c0a-bd61-d7621ba7c1db`) establishes exactly one generation, no repair,
upstream 200 in about 8.86 seconds, STOP and 4,195 output tokens. The compiled dev
module contained the first revision's new representation/participant instructions.
No upstream draft was captured for this request; `live-1.json` is its actual domain
response and `live-1-ui.png` is the unmodified browser result.

That output shows three agents on the complex carry-out claim, binary losses/gains
of electrons with within-cell context, binary intake with process context, and
Glucose → stores → Chemical energy. However it replaces actors by the process in
capture/production claims, uses qualified concept names and distributes the joint
air/soil phrase onto each intake. HTTP 200 is not evidence these choices are sound.

The final small prompt addition explicitly binds a relative clause to all preceding
actors on each derived production claim. Its test ran against a separate production
server on port 3007, with the first observed generation already accounted for in
`accounted-live-budget.json`. The guard permitted only one remaining real generation.
The untouched `generation-2.json` shows upstream 200 in about 11.97 seconds, STOP,
5,561 output tokens (7,442 total). Draft `s3` and `s4` both include Plants, Algae and
Bacteria as three agents; `s4` also contains Glucose. Draft `s12/s14` use binary
Water → loses → Electrons and Carbon dioxide → gains → Electrons with within-cell
conditions. These are findings from the real draft, not an accepted final response.

| Claim | Final real draft, not accepted analysis |
| --- | --- |
| Oxygen capture/production | Complex `s3`, all three agents, Sunlight input and Oxygen output |
| Stored chemical energy capture/production | Complex `s4`, all three agents, Sunlight, Chemical energy and Glucose |
| Electron loss/gain | Binary `s12/s14`; within-cell context remains |
| Intake | Still complex `s7–s10`, with unsupported separate air/soil pairings; desired conservative binary/joint representation not established |
| Scope | Most / some types remain in assertions, but required scope conditions are still empty; not fully compliant with prompt |

The model inserted omission markers into evidence: `s4` contains `(...)`, and
`s7–s10` contain `[...]`. These strings are absent from the source. Full backend
validation rejected the first bad quote, unchanged. The pipeline scheduled its usual
repair, but the diagnostic guard blocked it **before network access** because the
two-generation session ceiling had been reached. The route's final 503
`UPSTREAM_UNAVAILABLE` therefore reflects the guard refusal, **not a Gemini 503**.
No third generation or repair network request occurred, no quota error was observed,
and no fixture replaced the rejected result. The final semantic/UI outcome remains
unverified; the first successful UI result is preserved separately rather than
overwritten or represented as a success for the final prompt.

Commands:

```powershell
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/contracts/validate.mjs tests/analysis/pipeline.mjs tests/analysis/explanations.mjs tests/analysis/reference-graph.mjs tests/analysis/multisection.mjs tests/analysis/extraction-quality.mjs tests/analysis/representation-quality.mjs
npx playwright test tests/extraction-quality.spec.ts --workers=1 --retries=0 --output=test-results/representation-quality-v2/browser
npm run typecheck
npm run build
git diff --check
```

Offline browser tests intercept both source/analysis endpoints and use synthetic
pipeline results: no AI calls. Live is separately opt-in
(`RUN_REPRESENTATION_QUALITY_LIVE=1`). The first unused ledger was stopped when server
reuse was discovered; the accounted ledger includes that observed first generation
and has `calls: 2`, `maxCalls: 2`, `stopOnProviderError: true`. Do not repeat live testing
in this session. Previous-task ledgers remain untouched. The task's production test
server was stopped; the user's dev server on port 3000 was left running.
All captures/logs/screenshots are ignored under `test-results/representation-quality-v2`.

## Files in this continuation

- Production: `src/backend/analysis/prompt.ts`.
- Tests: `tests/analysis/representation-quality{,-fixture}.mjs`,
  `tests/analysis/fixtures/representation-quality-source.txt`,
  `tests/extraction-quality.spec.ts` and the fixtures README.
- Documentation: this report and its link in `docs/extraction-quality-v2.md`.

No staging, commit, push or deploy. `.env.local` and the pre-existing `next-env.d.ts`
are protected by byte/hash checks; neither belongs to this change.

Final status: 14 modified files and 13 untracked files, all unstaged. This includes
the earlier task's work and pre-existing `next-env.d.ts`; this continuation adds four
files and updates four existing task files. No unrelated UI/product changes were made.
