# Reference graph endpoint audit (2026-10-10)

## Findings and limits

No connected browser surface was available to inspect the existing React session.
No saved successful response for the reported screenshot was found in repository
files/test artifacts. Previous development logs contain metadata, not graph payloads.
Therefore the old screenshot's suspected Glucose-to-Photosynthesis stores edge
cannot be attributed to AI, normalization or rendering from the available evidence.

Exactly one new generation was made in the active development server using its
configured gemini-3.5-flash-lite, the existing adapter/prompt/schema and this source:

> Photosynthesis produces glucose and oxygen. Glucose stores chemical energy. Chlorophyll absorbs light energy.

It returned upstream HTTP 200 in 3,079 ms, STOP, 1,255 candidate/output tokens.
There was no retry or repair. The projected provider schema had 2,209 serialized
characters and no minItems/maxItems. The returned draft passed the original shape,
reference/evidence/lesson and domain validators after normalization.

| Assertion | AI draft subject -> relation -> object | After normalization | React Flow adapter |
| --- | --- | --- | --- |
| Photosynthesis produces glucose | Photosynthesis -> produces -> glucose | Same concepts/direction | Same concepts/direction |
| Photosynthesis produces oxygen | Photosynthesis -> produces -> oxygen | Same concepts/direction | Same concepts/direction |
| Glucose stores chemical energy | glucose -> stores -> chemical energy | Same concepts/direction | Same concepts/direction |
| Chlorophyll absorbs light energy | Chlorophyll -> absorbs -> light energy | Same concepts/direction | Same concepts/direction |

The new result contains one topic, six concepts, including chemical energy, and
four statements. This verifies the new extraction and data adaptation only; it
does not reproduce the previous session or prove the old image's visual geometry.
The new raw draft, normalized graph and imported source are saved locally in the
ignored test-results/reference-graph-live-audit.json, without credentials. The
temporary one-call route instrumentation was removed and the original route bytes
restored. No production extraction, normalization, layout or UI code was changed
speculatively; the model/environment were not modified.

## Code paths reviewed

- src/backend/analysis/prompt.ts requests atomic directed source assertions.
- src/backend/analysis/draft.ts defines one subject and one object ID per statement.
- src/backend/analysis/normalize.ts uses separate ID maps for concepts/statements,
  merges only exact topic/name/alias/symbol duplicates, remaps each endpoint by ID,
  and rejects unknown concepts/cross-topic relations. It does not guess or replace
  a missing endpoint. All distinct concepts are retained.
- src/backend/contracts/domain.ts and validate.ts require valid same-topic endpoints
  and source evidence. Quote occurrence/reference validity do not prove semantic
  agreement between an assertion and its chosen concepts.
- src/lib/reference-graph.ts preserves all topic concepts, scopes node IDs to the
  graph, and directly maps subjectConceptId to source and objectConceptId to target.
  Pair sorting is used for curve grouping only; it does not sort/flip endpoints.
- src/components/ReferenceEdge.tsx draws from the source handle coordinates to the
  target handle coordinates with markerEnd. No ID remapping is done in the renderer.

## Regression coverage

tests/analysis/endpoint-fixture.mjs is explicitly synthetic. Its opaque IDs, shuffled
collections and exact duplicate Chemical energy concepts exercise ID mapping
independently of labels/array positions. tests/analysis/reference-graph.mjs checks:

- Every expected endpoint through normalization and frontend adaptation at one,
  two and three layout columns; the stores target is Chemical energy.
- Exact duplicate remapping without dropping/replacing distinct concepts.
- Both separable products of "produces glucose and oxygen" survive as atomic claims.
- Missing object concept is rejected instead of redirected to the process.
- Parallel and reverse edges retain distinct identities, labels, targets and arrows.
- A synthetic joint subject remains an explicitly named composite concept, with
  the complete assertion and conditions retained. This is supported data, not a new
  automatic extraction/transformation rule. A jointly dependent assertion must not
  be split into independent claims that change its meaning. The v1 contract remains
  binary; richer participant/group schemas would require a separate agreement.
- Original input objects and graph data are not mutated by normalization/layout.

An optional offline test also reads the new saved live artifact and verifies every
draft/normalized/React Flow relation. It skips only when that artifact is absent;
synthetic passes alone never establish AI extraction quality. No tests call AI.

```powershell
node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json
node --test --test-isolation=none tests/analysis/reference-graph.mjs tests/analysis/pipeline.mjs
npm run typecheck -- --incremental false
```

Results: 68 tests passed (63 existing analysis tests, four synthetic regressions and
one saved-live data audit); typecheck passed. No evaluation/voice, aesthetic change,
dependency/lockfile update, commit or push was made. Existing changes, including
next-env.d.ts, were preserved. Further attribution of the old image requires that
session's actual statements/concepts or draft; no heuristic endpoint repair is claimed.
