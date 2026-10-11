# Extraction quality after graph v2 — 2026-10-10

Branch: `feat/extraction-quality-v2`, created from merge commit `286d4c6` with
contract 2.0. No public schema, model, environment file, dependency, token ceiling,
timeout, scoring/evaluation rule or layout algorithm was changed. No commit/push
was performed. Source generation remains initial plus at most one repair.

The subsequent targeted follow-up is recorded separately in
[complex participants and representation choice](representation-quality-v2.md).
Its results do not replace the historical live/provider result below.

## Findings and evidence

| Concern | What was verified | Layer |
| --- | --- | --- |
| Qualified assertion becomes a broad graph label | `toReferenceFlow` previously used only relation/polarity. A synthetic `Some types of bacteria` assertion retained its scope in domain/evaluation but lost it in the visible edge label. The exact reported session response was not found. | Adapter presentation |
| Missing Glucose in the reported complex participant list | The exact reported capture assertion was not found. UI maps every supplied participant; a pipeline fixture proves Glucose is rendered when supplied. Saved real v2 `st-10` demonstrates a different incomplete complex representation: air/soil are in the assertion but absent from participants. This is a review concern, not proof all such mentions must be nodes. | Reported case unconfirmed; saved omission begins in extraction |
| Definition explanations disappear | Saved real v2 generation 3 has no recognized statement for the source's `meaning it loses electrons` / `meaning it gains electrons` explanations. Source text and quote location alone do not establish coverage. | Extraction |
| Shared origins distributed onto each input | Historical v1 artifact `8e6bfd69-4f32-48cb-9ed4-51e90798f344-call-1.json` contains separate assertions giving both air/soil to each input. Real v2 generation 3 instead retains the joint complex assertion, so this is not established as a current v2 failure. | Historical extraction regression |
| Multi-agent assertion copied across edges | Saved real v2 generation 3 has the same unsplit assertion on `st-2/3/4`; current existing validation rejects it. No adapter remapping creates this. | Extraction; regression already present |
| Endpoints, identities, evidence | Existing wrong-object/self-loop/Markdown/ambiguous-quote regressions still run. Normalization preserves canonical identity and never invents a better-looking endpoint. | No new normalization defect established |

Original captures were read unchanged. The saved generation 3 uses the longer
multi-section source, whose opening contains the supplied two paragraphs; it is
not an exact new two-paragraph attempt. Original artifact paths are recorded in
[graph-v2 verification](graph-v2-verification.md).

## Changes

- Extraction instructions now request clause-first coverage, definition meanings,
  faithful qualifiers in assertions/conditions, explicit essential participants,
  meaningful roles and conservative shared-modifier handling. An internal check
  happens within the same generation, with no extra model call or checklist field.
- Source-only review diagnostics flag lost literal scope, known concepts omitted
  from complex participants without another claim sharing exact evidence, and
  unrecognized `meaning`-clause coverage. Longest concept names avoid treating
  Chemical energy as a mention of the distinct Energy concept. These warnings
  neither reject output nor infer truth: paraphrase, incidental mentions and
  evidence on a different claim can explain them. Unknown/missing concepts and
  general semantic completeness cannot be proven by these limited English cues.
- Binary edge labels expose existing conditions and literal scope phrases. A
  qualified paraphrase without an identifiable scope can show its full assertion.
  The complete assertion is also a tooltip. Concepts, IDs, directions, status
  overlays and grid coordinates are unchanged; complex remains a card.
- Identified statement failures use one local repair patch rather than returning
  the whole graph. Only failed claims, their original blocks, the canonical concept
  catalog and affected lessons are sent. Existing concepts/aliases, good claims,
  statement/topic IDs, original supporting block IDs and lesson links cannot be
  replaced or removed. Added genuinely missing concepts are allowed. Backend merges
  then revalidates the entire extraction, including evidence and references.
  Malformed JSON/global failures retain bounded full regeneration because there
  is no reliable statement identity to patch. Truncation/provider failure is never
  repaired. Patch failures never trigger a third generation.

The patch deliberately cannot split one faulty statement into new statement IDs;
it can retain a complete complex claim instead. Broader semantic repair, synonym
verification, participant-role entailment and complete coverage remain model/review
work, not deterministic guarantees. Evaluation code and grading criteria are unchanged.

## Before/after coverage

“After” below means a hand-authored synthetic draft passed through the actual
pipeline, normalization, adapter and UI. It is **not** a new successful AI output.
No exact topic names, node/edge counts or predicate vocabulary are acceptance rules.

| Essential source idea | Saved earlier real output | Synthetic after / regression |
| --- | --- | --- |
| Most life depends on photosynthesis | Assertion keeps Most; relation-only label hides scope | Assertion, conditions and label keep Most |
| Plants, algae, some bacteria perform the process | Unsplit assertion copied onto three binary projections | Independent assertions; shared canonical Bacteria with statement scope |
| Sunlight, oxygen, stored chemical energy, Glucose carrier | Inconsistent/incomplete projections; exact reported capture card not saved | Complete complex capture participants plus explicit storage claim |
| Herbivores eat plants; carnivores eat herbivores for energy | Earlier capture retains these ideas; no new defect inferred | Separate full transfer claims with food-source roles |
| CO2/water from air/soil | Historical v1 distributes origins; v2 keeps joint wording | Joint complex input/location claim; no invented pairing |
| Oxidation/loss and reduction/gain of electrons | Meaning clauses not represented in recognized v2 statements | Both names and explanatory claims linked to actual source quotes |
| Water → oxygen; CO2 → glucose | Earlier v2 includes conversion, one assertion is a fragment | Standalone assertions with unchanged source evidence |
| Oxygen released into air; storage within Glucose | Earlier v2 storage exists; release missing in the saved overview | Conditions/claims retain release destination and storage |

## Verification and live limit

Offline uses both the exact first paragraph and exact two-paragraph testcase;
`photosynthesis.The` remains unchanged. Non-biology regressions exercise negation,
some/only, conditional relations, joint participants, distinct similar names,
inverse predicates and legitimate reflexive loops. Synthetic fixtures are explicitly
labeled; original real captures are not corrected to make them pass.

The ordinary browser suite uses mock AI, including real local PDF/DOCX ingestion.
The extraction-quality browser fixture is produced by the actual backend pipeline;
binary/complex panels, conditions, evidence, summaries and labels are checked on
desktop/mobile. Screenshots still show small fitted labels and crossing edges;
no layout/fullscreen/highlight redesign was attempted.

Live: current configured `gemini-3.5-flash-lite`, key present, one request with the
unchanged two-paragraph source through the UI. Ingestion returned 200. The initial
Gemini generation returned **503 UNAVAILABLE in about 680 ms**, no Retry-After;
`/api/analysis` returned `UPSTREAM_UNAVAILABLE`. No draft, finish reason or token
usage was returned. No repair/retry occurred. Live testing stopped on provider error
despite one unused generation. No new live graph/summary or semantic improvement
is claimed. The private ledger is `test-results/extraction-quality-v2/live-budget.json`.

The diagnostic transport guard supports a smaller per-session ceiling through
`maxCalls` (up to the historical four-call ceiling) and `stopOnProviderError`.
For this task it enforced two calls and stopped after the first 503. Offline guard
tests use a fake transport, consume zero quota and do not establish live success.

Final checks:

| Check | Result |
| --- | --- |
| Contracts, analysis, evaluation/transcription compatibility, graph, extraction-quality and transport guard | 207 passed |
| Text/PDF/DOCX ingestion | 47 passed |
| Desktop/mobile browser (mock AI) | 54 passed; 2 opt-in live cases skipped |
| Explicit real UI attempt | Blocked by provider 503; 1 generation, no retry/repair |
| Typecheck, final production build, diff check | Passed |

The two skipped browser cases are opt-in live cases, not disabled offline regressions.
The separately enabled live assertion failed because the real endpoint returned 503.
The first transport-guard test run was sandbox-blocked from spawning child Node
processes; the permitted offline rerun passed. No test was removed or validator relaxed.

Commands:

```powershell
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/contracts/validate.mjs tests/analysis/pipeline.mjs tests/analysis/explanations.mjs tests/analysis/reference-graph.mjs tests/analysis/multisection.mjs tests/analysis/extraction-quality.mjs tests/analysis/diagnostic-budget.mjs
npm run typecheck
npm run build
npx playwright test tests/session.spec.ts tests/explanations.spec.ts tests/multisection-replay.spec.ts tests/extraction-quality.spec.ts --workers=1 --retries=0 --output=test-results/extraction-quality-v2/browser
git diff --check
```

Do not repeat the opt-in live test in this task; its ledger is stopped. Local artifacts,
raw sources, screenshots and logs are ignored under `test-results/extraction-quality-v2`.
`next-env.d.ts` retains its pre-task bytes and remains outside staging; `.env.local`
hash is unchanged. Test servers were stopped. Long-document/chunking/token capacity,
general extraction quality and dense graph readability remain outside this task.

## Changed files

Production: `src/backend/analysis/{prompt,pipeline,normalize,review,statement-repair}.ts`;
`src/backend/contracts/statement-scope.ts`; `src/lib/reference-graph.ts`;
`src/components/ReferenceEdge.tsx`.

Tests: `tests/analysis/{extraction-quality,extraction-quality-fixture,diagnostic-budget}.mjs`;
`tests/analysis/{multisection,reference-graph}.mjs`; `tests/analysis/live-budget.cjs`;
`tests/analysis/fixtures/{extraction-quality-source.txt,README.md}`;
`tests/extraction-quality.spec.ts`; `tests/session.spec.ts`.

Docs: this report; `backend-contract-v2.md`; `source-analysis.md`; `README.md`.
