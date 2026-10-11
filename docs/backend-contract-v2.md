# Graph contract v2: document-wide concepts and statement views

Current runtime acceptance: [nonblocking graph output](nonblocking-output.md).
The field structure remains v2, but incomplete evidence/participants/comparison
coverage are renderable. Strict quality checks, exact-content deduplication, UUID
generation and bounded repair described below belong to the earlier implementation;
the linked page defines current normalization and deterministic IDs.

The [frontend visualization update](graph-visualization.md) renders complex
statements as relation nodes with role connections. It preserves this domain
contract and the original statement-based evaluation counts.

[Lesson / Explanation / Compare](lesson-explanation-compare.md) adds optional v2
concept identity alignments to the existing evaluation response. Legacy responses
remain valid; unmatched/uncertain identities are never merged by label similarity.

The [multi-section follow-up](topic-processing.md) adds opt-in sequential extraction
and checkpoints without changing the final graph/evaluation contract. Its document-wide
limits remain those below; the eight-generation orchestration budget supplements the
legacy two-generation single-call operation.

This is an incompatible replacement of the v1 graph contract. All current API
envelopes and versioned requests use `schemaVersion: "2.0"`, including ingestion
and transcription envelopes whose content otherwise stays the same. Old `1.0`
payloads are rejected. Reset/re-import existing browser sessions; there is no
database migration or production fallback that guesses how to upgrade old graphs.
Historical artifacts remain unchanged. Test-only shape migration never corrects
their semantic mistakes or establishes a new live success.

## Domain and identity

- A concept is `{ id, documentId, name, aliases, symbol? }`. It has no topic owner.
  IDs are unique within the graph's concept collection and belong to its document.
- AI uses one canonical draft ID per entity/meaning across the entire document.
  Normalization maps this ID to one UUID used by every statement. Repeated records
  with the same ID and identical name/alias-set/symbol collapse; conflicting records
  fail. Different IDs stay separate, even with identical names, rather than guessing
  whether they are synonyms or homonyms. There is no fuzzy label/alias merge.
- Each statement has one primary `topicId`, full assertion, `negated`, conditions,
  optional formula, role and evidence IDs. It references any concept in the same
  graph/document. Source statement IDs survive topic selection and every evaluation.
- Graph/document IDs distinguish source from learner. Cross-graph statement refs
  stay `{ graphId, statementId }`. Evaluation does not regenerate the source graph.

The discriminated representation is required:

```ts
type StatementRepresentation =
  | { kind: "binary"; subjectConceptId: string; relation: string; objectConceptId: string }
  | { kind: "complex"; participants: { conceptId: string; role: string }[] };
```

Binary assertion and affirmative relation/endpoints/qualifiers express the same
claim. `negated` supplies polarity; a negative relation plus `negated: true` is
invalid. Independent products can be split into statements sharing the same quote.
Coupled reactants/products or essential dependencies stay complex with roles and
the whole assertion, without null/fake endpoints. Both forms are evaluation units.

## Evidence and quality checks

AI supplies `blockId` and an exact raw quote. Backend computes block-local UTF-16
half-open ranges and up to 80 adjacent characters on each side. Quotes include raw
Markdown punctuation: `light-*dependent*` is not `light-dependent`.

One occurrence is located even if optional AI context hints are wrong. Multiple
occurrences may use valid hints to disambiguate; invalid hints never select the
first occurrence. Unresolved repetitions remain unverified without a range/context.
Zero occurrences fail. Empty optional contexts/symbol/formula normalize to absent;
empty quotes still fail. Learner evidence follows the same rules in the exact input.

Validation retains unique IDs, existing endpoints/participants, document ownership,
evidence document/block/quote/range/context, one primary topic, lesson links and
collection bounds. Topic crossing is permitted for concepts, not lesson membership.

`inspectStatement` is a limited English literal projection check, not an entailment
model. It recognizes affirmative-relation/polarity conflicts, a different canonical
object at an aligned subject/predicate, an object displaced into a trailing clause,
non-reflexive self-loops with an incompatible literal object, an unsplit conjunctive
assertion copied onto different partial projections, and explicit omitted
participants after an otherwise aligned binary projection. These report concrete
paths and draft IDs for repair. Unaligned subjects/predicates, generic relations,
other lexical object differences and legitimate reflexive loops produce review
diagnostics. Alias and coreference may explain lexical differences. No check changes
endpoints, assertion or polarity; no default extra semantic AI call is added.

Review warnings mean the projection has **not** been semantically verified. Complex
participant roles and full assertion entailment still need model/user review. A
verified quote proves location only. `UNUSED_CONCEPT` exposes orphan concepts;
`COVERAGE_LIMIT` exposes a reached collection ceiling. One statement per knowledge
block is structural coverage, not a guarantee that all ideas were extracted.

The existing limits stay in effect: 20,000 source UTF-16 characters, 120 blocks,
12 topics, 100 concepts, 120 statements, four evidence items per source statement,
20 participants per complex statement, 100,000 generated JSON characters and 8,192
output tokens. No source is silently cut. Provider schema retains the `anyOf`
discriminator but omits the previously rejected array min/max keywords; local
validation keeps all array bounds. Truncated output never becomes a partial graph.

Source analysis still allows at most two generations, initial plus one invalid-output
repair. When every error targets a known statement, repair receives only those claims,
their original source blocks, canonical concept catalog and affected lessons. The patch
keeps statement/topic IDs, all good claims, existing concepts and lesson links; backend
merges it and revalidates the entire extraction. Malformed JSON/global structure without
identifiable claims retains the bounded complete regeneration. SDK attempts remain one.
Provider failures/quota/timeouts are not retried.

Source-only `EXTRACTION_REVIEW` diagnostics now also flag literal signs of lost
scope, known concepts omitted from complex participants without another claim sharing
the same exact evidence, and uncovered explicit `meaning` clauses. These are review
cues, not entailment errors: paraphrase, incidental mentions or separate evidence may
explain them. They do not reject/repair output or alter evaluation rules. The prompt
requests clause/definition coverage, qualified assertions and conditions, meaningful
participant roles and conservative handling of shared modifiers.

## API and consumers

Routes remain `POST /api/sources`, `/api/analysis`, `/api/transcriptions`,
`/api/evaluations`. Transport details: [ingestion](source-ingestion.md),
[analysis](source-analysis.md), [explanations](source-explanations.md).

```ts
// No server-side storage is assumed.
const analysisRequest = { schemaVersion: "2.0", importedSource, outputLanguage: "source" };
const evaluationRequest = {
  schemaVersion: "2.0", importedSource, sourceAnalysis,
  topicIds: sourceAnalysis.graph.topics.map(t => t.id), learner: { text: explanation },
};
// Success: { ok: true, schemaVersion: "2.0", data }
// Failure: { ok: false, schemaVersion: "2.0", error: { code, message, retryable } }
```

Evaluation extracts canonical learner concepts plus binary/complex claims into an
independent learner graph. Source topic IDs/order/headings are not imposed on claims.
There is exactly one comparison per selected source statement, keyed by required
`referenceRelationshipId`; `sourceStatements` contains its single graph-qualified ref.
One claim may support multiple references and many claims may support one reference.
Verdicts are not copied to other IDs. Results are grouped by source topics afterward.

Statuses remain correct, partial, missing, contradicted, uncertain. Missing has no
learner quote and means not expressed here. Contradicted requires real learner
evidence. Matching uses assertion, original evidence and representation, not graph
endpoints alone. Ambiguous evidence downgrades a proposed definite status to uncertain.
Additional ideas stay outside verdicts and need no source topic. The UI shows ungrouped
additional ideas under the first source topic. There are no scores or topic-order joins.

## Topic view and frontend mapping

Topics are sorted by earliest supporting evidence `(source block index, quote start)`;
unknown starts use a stable fallback and ties preserve draft order. Lessons follow
this order and the UI initially selects the first topic.

```text
selected = graph.statements.filter(primaryTopic == selectedTopic)
edges = selected.binary
visibleConceptIds = union(binary endpoints, complex participants)
nodes = graph.concepts whose ID is in visibleConceptIds
summary = lesson section of selectedTopic
```

`toReferenceFlow` adds only presentation coordinates, namespaced node IDs and curves.
Parallel/reverse/self edges retain separate statement IDs. Complex assertions are
cards with roles/evidence/status, not fabricated edges. Topic changes remount the
selection panel, so no out-of-topic selection survives. Evaluation overlays exact
reference IDs on binary edges and complex cards. Existing grid layout/zoom is retained;
dense labels/crossings are not solved by this architecture change.
Binary edge labels also expose existing statement conditions and recognized English
scope phrases from the assertion. A qualified paraphrase without a literal concept
match can use the full assertion as its label. The assertion is available as a tooltip;
no node identity, endpoint or backend coordinate changes are made.

## Verification commands

```powershell
npx tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/contracts/validate.mjs tests/analysis/pipeline.mjs tests/analysis/explanations.mjs tests/analysis/reference-graph.mjs tests/analysis/multisection.mjs
npx tsc -p tests/sources/tsconfig.json
node --test --test-isolation=none tests/sources/ingest.mjs
npm run typecheck
npm run build
npx playwright test tests/session.spec.ts tests/explanations.spec.ts tests/multisection-replay.spec.ts --project=desktop --workers=1
```

Contract tests now consume compiled backend output; run the analysis compilation
first. `global-fixture.mjs` is explicitly synthetic. `legacy-artifact.mjs` only moves
old fields into the v2 representation for offline replay and is never imported by
production. Original multi-section captures are not hand-corrected for acceptance.

Live test `graph-v2-live.spec.ts` is opt-in, uses actual Next routes and preserves the
entire saved multi-section source including license. The diagnostic preload
`live-budget.cjs` enforces a persistent four-generation ceiling, rejects parallel
generation and stops after 429. It does not modify requests, model or responses.
Keep its state file between runs. Offline browser tests intercept AI and do not
establish model accuracy. See [verification results](graph-v2-verification.md).
