# Source polarity blocker

The literal binary validator previously inferred polarity only from negation
before the predicate. Consequently, a valid `Tree -> has -> Cycles` with assertion
`A tree has no cycles.` and `negated: true` was rejected: it incorrectly inferred
an affirmative predicate. This false positive is reproduced by synthetic tests.
Normalization copies polarity unchanged; it was not causing this reproduced error.

The guard now recognizes an object-head negative determiner only when the positive
object concept matches after `no`. It does not search the whole sentence for `no`.
An affirmative membership claim whose object is the complete property
`Connected graph with no cycles` remains affirmative. An object named `No cycles`
can also carry absence internally. These forms must not additionally negate the
outer relation. Nested double negation remains a scope review, with no inferred
polarity rewrite. Inconsistent polarity is still rejected.

`Not necessarily` does not negate an unqualified predicate. Its modal assertion and
conditions are retained, with a review finding; an incorrectly negated unqualified
binary projection is rejected. `Not sure whether` is covered by a complete modal
complex-claim regression rather than asserted positive/negative cycle knowledge.
The source prompt contains matching guidance. No IDs, assertions, evidence or
polarity fields are rewritten to force validation success.

## Evidence and limits of verification

The original request `4160d2a3-d7ad-4c79-aa8c-20716258f9e0` is present in
`.next/dev/logs/source-analysis.jsonl`. It confirms the reported two `STOP`
responses and the remaining `.negated` error. Raw initial/repair drafts were not
saved; the exact old representation cannot be established from those metadata.
The user's old browser checkpoint was not accessible and was not fabricated.

The exact supplied source imports as 28 blocks / 3 parts. A new live test used
the complete unfinished `Graphs and trees` section (all six blocks), without
regenerating the two preceding parts. It was an isolated new ingestion/analysis,
not continuation of the inaccessible checkpoint. Two real generations were used:
initial `STOP` (4,905 output tokens) and existing reference repair `STOP` (626 tokens).
The repair addressed a missing concept reference, not a polarity error. The endpoint
returned 200 after approximately 12.6 seconds with 14 statements. The new tree
definition was complex and affirmative, with its complete assertion and exact quote.

The actual browser displayed the graph and switched between its `Graphs` and `Trees`
topics without another analysis request. Offline replay of both unmodified new live
outputs passed the actual pipeline. Related offline suites: 133 passed, one unrelated
private-artifact test skipped. Typecheck, build and diff checks passed.

Ignored captures are under `test-results/source-polarity/`. This proves the isolated
unfinished section works; completion of the original five-topic session and the exact
cause of its old draft failure remain unverified. Model, source output budget (16,384),
timeouts, contract 2.0, UI, evaluation and voice were not changed by this fix.
