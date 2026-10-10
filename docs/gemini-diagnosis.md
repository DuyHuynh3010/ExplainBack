# Local Gemini diagnosis (2026-10-10)

## Sequential basic-call control experiment

The next task authorized up to three sequential calls, continuing only after a
successful preceding test. It used exactly one call in the active development
server, with the same server key, gemini-3.8-flash and @google/genai 2.28.0. The
temporary guarded instrumentation in the existing route was removed afterward;
the route was restored to its original contents. No permanent code/configuration
change was justified by this result.

| Test | Actual request | Result |
| --- | --- | --- |
| 1 | Reply with exactly OK.; no system instruction/schema, candidateCount=1, maxOutputTokens=1024 | 144 ms, HTTP 429 RESOURCE_EXHAUSTED; no finish reason or token usage |
| 2 | One-field message string schema | Not called: stopped after test 1 |
| 3 | Short source through the current analysis adapter, no repair | Not called: stopped after test 1 |

Thinking configuration was omitted exactly as in the current adapter: the model
default was retained, not changed or inferred from latency. The actual wire header
was X-Server-Timeout: 60. SDK retryOptions.attempts was 1, with a one-call transport
guard and no pipeline/repair. The local 60-second abort timer did not fire; the
provider returned the 429 immediately, rather than DEADLINE_EXCEEDED.

Sanitized upstream message: "You exceeded your current quota ... Quota exceeded
for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
limit: 20, model: gemini-3.8-flash ... Please retry in 2h54m6.320698001s."
Provider URLs were redacted; no key or environment contents were printed.

The google.rpc.QuotaFailure details identify:

- Metric: generativelanguage.googleapis.com/generate_content_free_tier_requests.
- Limit ID: GenerateRequestsPerDayPerProjectPerModel-FreeTier.
- Limit value: 20; dimensions: model=gemini-3.8-flash, location=global.
- google.rpc.RetryInfo.retryDelay: 10446s (2h54m6s).
- HTTP Retry-After: absent.

The basic call is currently blocked by the per-day, per-project, per-model free-tier
request quota. This does not establish why earlier analysis calls timed out, and
does not implicate the graph schema. The remaining comparison requires a basic
success and a minimal-schema success after the indicated cooldown/quota availability;
no extra calls or billing changes were made. Public contracts, timeouts, UI,
validators, next-env.d.ts and existing uncommitted work remained unchanged in this
control experiment. No test suite was rerun because no production code was changed.

## Timeout follow-up on the real local UI

A new debugging task authorized at most four additional live calls. It used three
calls, all on `gemini-3.8-flash`, with the supplied photosynthesis source. SDK retries
remained disabled, and provider failures no longer trigger pipeline retries. Logs
confirmed the running server's model, key presence and outgoing 2,209-character
schema without array bounds. No environment file or model was changed.

| Request ID | Calls | Result and evidence |
| --- | --- | --- |
| 263bf0f7-4e84-46ed-a102-5c6348511985 | 1 initial, 0 repair | Upstream 504 DEADLINE_EXCEEDED at 24,319 ms; pipeline deadline was 25,000 ms. No finish reason, output, JSON/domain validation, or second call. |
| 23ef292d-28c6-4714-b67a-4bf0327458fe | 1 initial, 0 repair | After timeout fix: upstream 503 UNAVAILABLE at 840 ms; no Retry-After header. |
| e6269a44-397f-4ab4-a341-76a61784e65e | 1 initial, 0 repair | After more than 60 seconds of cooldown: upstream 429 RESOURCE_EXHAUSTED; no Retry-After header. Stopped without consuming the remaining call allowance. |

The installed SDK sends its timeout as X-Server-Timeout, so the former 25-second
setting imposed an upstream deadline in addition to the application's timer. This
is evidence of upstream deadline expiry influenced by the app's configuration;
it is not evidence of invalid output, a repair loop, or a client timeout. The minimum
fix increases the shared SDK/pipeline call window to 60 seconds and the total bounded
initial-plus-repair window to 122 seconds. No generation parameters, output limits,
public payloads or validators were weakened. An offline SDK transport test verifies
the actual 60-second header. Whether the model finishes within the longer window
remains unproven because subsequent attempts hit provider overload/rate limits.

The opt-in Playwright test uses the user's localhost origin, waits for hydration,
imports the exact supplied text, checks the real API response and, on success, checks
each real topic/summary plus node and statement/evidence selection. Initial attempts
using 127.0.0.1 did not reach APIs: React state remained empty and Next.js reported
blocked cross-origin dev resources. They made no observed AI calls. With localhost,
all three real attempts imported through /api/sources with HTTP 200, then surfaced
the actual analysis failures. No fixture/mock response or hidden success was used.

Server logs now distinguish pipeline/SDK/upstream timeout and initial/repair calls.
Each API response includes x-request-id; Retry-After is safely forwarded when present.
Tests cover local timeout, upstream timeout, bounded JSON repair, private log metadata,
the SDK timeout header, and one-call provider failures with Retry-After. The analysis
suite passed 63 tests and typecheck passed. No full build/browser mock suite was run.
The live browser checks did not reach graph/summary/topic/evidence: these remain
unverified on the current patched flow because of real upstream failures. Prior
successful controlled extraction is not claimed as current end-to-end UI success.
All existing work and next-env.d.ts were preserved; no commit/push/merge was performed.

## Follow-up after changing the configured model

The active development server subsequently confirmed `gemini-3.8-flash` and
`keyExists=true`. Four further generation calls were made in this follow-up, each
directly through the adapter with retries disabled (not through the pipeline's
repair loop). Model, text input, prompt, system instruction, maxOutputTokens=8192,
and candidateCount=1 were held constant. No environment file was edited.

| Call | Schema / adapter | Upstream result |
| --- | --- | --- |
| 1 | One-field schema, original adapter | 504 DEADLINE_EXCEEDED: Deadline expired before operation could complete. |
| 2 | Full bounded schema, original adapter | 400 INVALID_ARGUMENT: Request contains an invalid argument.; no details |
| 3 | Same full shape, only minItems/maxItems omitted | 200, STOP; parseDraft and normalizeAnalysisDraft passed, including validateSourceAnalysis |
| 4 | Original full runtime schema supplied to patched adapter, bounds projected out | 503 UNAVAILABLE: high demand; stopped immediately |

The original schema is 2,510 serialized characters, 47 schema nodes and seven
structural levels deep. It has 11 array schemas carrying minItems/maxItems. Removing
only those constraints reduces it to 2,209 characters. These keywords are documented
as supported; this is evidence that the complete combination of bounds triggers
rejection, not that Gemini categorically rejects each keyword. The exact offending
bound or internal complexity threshold was not isolated within the four-call budget.
The successful same-options request rules out candidateCount/maxOutputTokens as
the cause of the observed schema-dependent rejection in this comparison.

The minimal production change is a non-mutating provider-schema projection in
gemini.ts. Required fields, object/array types, additionalProperties=false, enum
constraints and structured JSON output remain. The original schema, local array
limits, public contract, evidence and reference validators are unchanged. No SDK
upgrade or responseFormat transport change was made. Tests verify absence of array
bounds throughout the outgoing SDK schema, unchanged original schema, retained
shape constraints, and local rejection of excessive conditions or empty evidence.

The follow-up analysis suite passed 59 tests; typecheck passed. No full build or
browser suite was run for this follow-up. A real analysis succeeded in the controlled
third call; the post-patch fourth call was inconclusive because of provider overload.
This does not prove general semantic quality or a successful end-to-end browser run.
The temporary probe route was removed, next-env.d.ts remained byte-for-byte intact,
and all pre-existing changes were preserved. No commit or push was performed.

## Observed evidence

The remaining sections record the earlier diagnosis before this follow-up.

The active Next.js development process on localhost:3000 reported
`GEMINI_MODEL=gemini-3.8-flash-lite` and `keyExists=true`. A fresh Next environment
load reported the same values. Neither the key nor environment-file contents were
printed, edited, or staged. These observations do not indicate a stale model value
in that process.

A short text request used the actual Gemini SDK adapter with an injected transport
that captured only sanitized response diagnostics. Each generation probe allowed
one network call, with SDK retries disabled. No fallback model was configured.

| Probe | Upstream HTTP / status | Sanitized upstream message | Conclusion |
| --- | --- | --- | --- |
| Active model, complete analysis schema | 404 / NOT_FOUND | models/gemini-3.8-flash-lite is not found for API version v1beta, or is not supported for generateContent. | The active model ID cannot serve this operation. |
| Read-only ListModels with the active key | 200 | No error; complete page, no next-page token. | Key can list models; this does not prove generation access/quota for every model. |
| Listed gemini-3.8-flash, complete analysis schema | 400 / INVALID_ARGUMENT | Request contains an invalid argument. | Generic request rejection; schema/SDK cause is not established by this message. |
| Same listed model, one-field JSON schema | 503 / UNAVAILABLE | This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. | Temporary provider overload, not a reported 429 quota error; no successful schema control. |
| Same listed model/full schema, diagnostic responseFormat wire change | 400 / INVALID_ARGUMENT | Invalid value at 'generation_config.response_format.text.mime_type' (type.googleapis.com/google.ai.generativelanguage.v1beta.TextResponseFormat.MimeType), "application/json" | That diagnostic alternative is also rejected; it is not adopted in the adapter. |

ListModels included `gemini-3.8-flash`, `gemini-3.5-flash-lite`, and
`gemini-3.1-flash-lite`; it did not include `gemini-3.8-flash-lite`. A similarly
named `gemini-3.8-flash-lite-tts` is not a substitution for this JSON text task.
There were four bounded generation probes in total, one read-only listing, no
automatic retries, and no further live probes after these results. The listed
model override existed only inside diagnostic requests; the environment remained
unchanged. The temporary diagnostic route was removed.

## Minimal fix and required configuration correction

The old adapter collapsed upstream 400/401/403/404 into the same AI_NOT_CONFIGURED
response. The adapter now returns controlled, actionable messages:

- 401 or explicit invalid/expired key diagnostic: AI_NOT_CONFIGURED, check key.
- 403: AI_NOT_CONFIGURED, check key restrictions/project permissions/model access.
- 404: AI_NOT_CONFIGURED, select an available generateContent model ID.
- Other 400: ANALYSIS_FAILED (HTTP 500), distinguish explicit schema/generation
  configuration diagnostics from an unspecified INVALID_ARGUMENT.
- 429: AI_RATE_LIMITED; 5xx: UPSTREAM_UNAVAILABLE, as before.

Raw SDK messages, keys, and source data remain excluded from API errors. Rejected
requests do not consume the pipeline's repair/retry call. No contract enum,
dependency, SDK option, or production schema was changed speculatively.

The developer must replace the nonexistent GEMINI_MODEL value with an exact
available text-generation ID, then restart Next.js. `gemini-3.8-flash` is an
observed available ID, but its complete analysis request returned the generic 400
above, so changing to it is not claimed to make the entire flow pass. Further
schema/SDK diagnosis would need a successful control or a specific provider
diagnostic; the current evidence does not justify weakening validation or blaming
credentials. No billing/account changes are required by or performed in this task.

## Verification

The analysis suite has 58 passing offline tests, including eight new HTTP/SDK cases
for key, access, model, schema/config, and unspecified invalid-argument failures.
These check controlled messages, secret redaction, and exactly one call on rejected
requests. Existing 429 and 503 cases verify their separate error codes. Block 1's
64 contract tests, project typecheck, and production build also passed. The build's
initial sandboxed TypeScript worker was blocked by spawn EPERM; rerunning with
child-process permission passed. The pre-existing next-env.d.ts bytes were restored
after Next.js generation; all previous UI work was preserved. No real
SourceAnalysis success or semantic-quality proof is claimed.

Primary references: [ListModels](https://ai.google.dev/api/models#method-models.list)
and [structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
The current structured-output examples include responseFormat; the observed
provider rejection above is retained rather than assuming the example resolves
compatibility with the installed SDK and endpoint.
