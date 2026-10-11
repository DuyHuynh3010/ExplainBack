# Source-analysis output budget

Source analysis now sends `maxOutputTokens: 16384` instead of `8192`, including
its existing bounded repair calls. Live SDK model metadata for the configured
`gemini-3.5-flash-lite` reports an output limit of `65536`, so the new budget is
supported. No model, environment, timeout, transcription, evaluation or public
contract setting was changed by this fix.

The independent 100,000-character JSON ceiling, 1,000,000-byte request ceiling,
graph limits and validation remain enforced. `MAX_TOKENS` remains a hard failure:
even parseable JSON is rejected with `AI_OUTPUT_TRUNCATED`, without repeating
the same truncated generation or substituting a fixture.

## Verification

- Related offline suites: 92 tests passed, including budget forwarding through
  repair and rejection of parseable truncated output without retry.
- Production build and project typecheck passed.
- Resumed the actual saved discrete-math checkpoint: unchanged source of 2,646
  characters / 16 blocks, accepted part 1 retained; part 2 (Sets and functions)
  sent to the live endpoint. Exactly two real generations were used, with SDK
  retries disabled: extraction (`STOP`, 5,162 output tokens) and the existing
  scoped representation repair (`STOP`, 709 output tokens). The endpoint returned
  200 after approximately 12.6 seconds and backend validation passed.
- The browser reached the reference graph from that live response. A test-envelope
  assertion initially failed because it incorrectly passed orchestration metadata
  to the base imported-analysis validator. After correcting the test, the captured
  complete live response was replayed without any further generation: base contract
  validation, all three topic selections, summaries and relationship details passed.
  The result contains 34 statements. No fabricated analysis was substituted.

Artifacts are ignored under `test-results/source-output-budget/`: model metadata,
generation captures, server diagnostics, complete response, UI verification and
screenshot. `tests/source-output-budget.spec.ts` requires explicit live opt-in;
`REPLAY_SOURCE_OUTPUT_RESULT=1` checks the saved response without calling AI.

The original reported 8,176-token / 23,564-character failed response was not found
in available artifacts. Its chunk identity remains unknown. This successful resume
does not prove the same stochastic output would have exceeded 8,192 tokens; both
new generations used fewer tokens. It establishes a supported larger budget and
a complete validated live result for the saved source, not semantic completeness
or guaranteed success for every future extraction. Part 1 was reused, not generated
again in this session.
