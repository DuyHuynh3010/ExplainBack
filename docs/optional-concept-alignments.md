# Controlled fallback for optional concept alignments

`EvaluationResult.conceptAlignments` is optional in contract 2.0. It supplies
display identity suggestions, not required learner extraction or grading data.
The Compare adapter merges only explicit `matched` identities; omitted/uncertain
identities remain separate. There is no name or alias fallback.

The strict validator is unchanged. An alignment requires both concept IDs to
exist and a comparison linking a learner statement containing the learner ID to
a reference statement containing the reference ID. All comparisons are searched;
topic/order and binary/complex representation do not limit this check.
Normalization remaps draft learner IDs with the same exact-ID map used for claim
endpoints/participants. Reference IDs stay unchanged. Supporting comparison is
structural evidence, not proof that the concepts are semantically equivalent.

## Before and after

Previously an unsupported optional suggestion failed the entire candidate and
triggered scoped alignment repair. A patch retaining the suggestion still failed
after the existing second generation, even if extraction and grading were valid.

Now `normalizeEvaluation`:

1. Constructs the candidate using the existing IDs, evidence and comparisons.
2. Validates the complete candidate with the existing strict validator.
3. Removes only alignments flagged at their exact array path with rule ID
   `unsupported_concept_alignment`, whose two concept IDs exist and which have
   no other alignment-specific error. A collection-level error such as duplicate
   learner IDs prevents sanitization, so it cannot be hidden by removal.
4. Revalidates the entire candidate. Only if this passes is it returned; otherwise
   mandatory errors continue through the existing scoped repair/failure path.
5. Runs the same normalization and sanitization after the single permitted patch.

The sanitizer creates a filtered alignment array without mutating its input or
reallocating graph/document/claim/evidence/comparison IDs. It preserves every
concept, assertion, formula, condition, polarity, verdict, quote and range.
Unknown IDs, malformed shape, duplicated IDs and mandatory claim/reference/
coverage/evidence failures are not warnings and are not silently discarded.
There is no new generation, retry, model, timeout, output budget or public schema.

`evaluation_alignments_removed` reports call number, count, safe IDs/path and
the specific rejection reason. Opt-in development captures include original raw
draft/patch, sanitized candidate and removal issues at
`.explainback-artifacts/evaluations/`. This ignored directory is separate from
`test-results/`. Console diagnostics never contain whole source/learner text.

## Evidence

Request `08235f49-5777-4abd-bc34-dd8dcc2d17fd` has saved metadata showing one
unsupported alignment issue before/after its alignment-only repair, both Gemini
200/STOP (7528/4351 output tokens). No raw draft/patch was found in the inspected
local artifacts. The exact mapping and its semantic validity cannot be recovered
from these logs. Synthetic fixtures reproduce the validator and previous blocker;
they do not claim to replay that private response.

Offline regressions cover valid and invalid suggestions, multiple comparisons
with reversed order, complex participants, mixed mapping arrays, unchanged IDs/
data, unknown IDs, duplicates, mandatory claim/evidence failures, pre/post-repair
handling and same-label concepts kept separate on Compare. Biology/networking
cases are hand-authored mechanics checks, not new live semantic evaluations.

Verification for this change: 171 offline tests passed, four unavailable private
artifact replays skipped; typecheck, production build and diff checks passed.
Desktop/mobile browser replay passed (two cases), checking Explanation -> Compare,
feedback/highlight, same-label unaligned nodes remaining separate and no extra
API calls on view switches. Every browser API was intercepted; a server transport
guard blocked AI. **Zero live generations** were used: offline fixtures and replay
establish this bounded sanitization behavior without recreating the lesson.
Current capture/metadata/logs/screenshots live under the ignored
`.explainback-artifacts/`; Playwright output is explicitly separate at
`playwright-report/alignment-sanitization-output`.
