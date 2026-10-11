# Linked graph visualization

This frontend update preserves contract `2.0`, extraction, section processing,
checkpoints and evaluation algorithms. It makes complex statements visible on
the same canvas as binary statements. No live AI requests were used to verify it.

## Representation and identity

`toReferenceFlow` keeps one concept node per referenced concept in the topic.
A binary statement remains one directed edge with its original statement ID,
qualified relation label, polarity and conditions. Parallel, reverse and self-loop
relationships remain separate.

Each complex statement has a distinct relation node and one connection for every
participant, including repeated roles. Its label is a deterministic excerpt of
the assertion; the details panel shows the complete original assertion.
Agent/input arrows enter the relation node; output arrows leave it. Other roles
use labeled dashed connections without arrows. These connections express roles
in one statement, not additional binary claims or implied causal relationships.
Relation nodes and all role connections carry the original `referenceStatementId`.
Counts still use source statements, and evaluation overlays join by source graph
and reference statement IDs. Concepts do not acquire evaluation statuses.

## Layout and interaction

`elkjs` is the only added dependency. The browser measures React Flow node boxes
and wrapped edge labels before applying a seeded ELK layered, orthogonal layout.
Separate ports keep parallel and reverse routes distinct. Disconnected components
remain disconnected. Backend contracts receive no coordinates or display types.

Selection updates highlighting and the existing details panel without rerunning
layout or fitting the viewport. Topic changes remount the topic canvas and ignore
cancelled asynchronous layout results. Concept selection highlights direct
neighbors; statement selection highlights all its original role connections.
Clicking the background clears highlighting.

Zoom, Fit graph and Expand/Close graph controls are available. Escape closes the
expanded explorer, which retains its topic selector and details panel. Initial
zoom is bounded below at `0.85` so large graphs can be panned rather than silently
shrinking all text. Explicit Fit graph provides an overview and may make text
small, especially on phones; zoom in to read details. Review notes are collapsed
by default; blocking API errors keep their existing error presentation.

## Verification

- 223 related offline tests: 220 passed, three live diagnostics skipped, zero failures.
  Coverage includes contracts, analysis, evaluation, transcription,
  representation, adapters, section processing and layout.
- 66 Chromium browser tests passed across desktop/mobile; six opt-in live cases
  were skipped. Existing source, explanation, audio and feedback flows use mocks
  for AI; PDF/DOCX ingestion cases still exercise real local ingestion.
- Typecheck and production build passed. Zero live AI calls.
- Synthetic target fixtures cover Food chains, mixed Photosynthesis, long-label
  Chlorophyll, and a dense system with repeated roles, shared concepts, cycles,
  parallel/reverse edges, disconnected components, self-loops and all five statuses.
  Offline layout checks cover node/label boxes and routes avoiding unrelated nodes;
  browser checks use actual node bounding boxes, selection, topic changes, viewport
  stability, expanded explorer and Escape. Screenshots were visually inspected.

Generated screenshots and logs are ignored under
`test-results/graph-visualization/`. They include each topic on desktop/mobile and
`initial-readable-*.png` before the explicit Fit graph overview. These fixtures
verify representation and rendering, not live extraction/evaluation semantics.
No before screenshots were captured. Arbitrarily larger graphs can still have
crossing routes, and full-graph overviews may require zooming to read.

## Changed files

- Dependency: `package.json`, `package-lock.json`.
- Adapters/layout: `src/lib/reference-graph.ts`, `src/lib/evaluated-graph.ts`,
  `src/lib/graph-layout.ts`.
- Components/styles: `src/components/UnderstandingMap.tsx`,
  `src/components/ReferenceCanvas.tsx`, `src/components/KnowledgeNode.tsx`,
  `src/components/ReferenceEdge.tsx`, `src/components/SourceEvidenceDetails.tsx`,
  `src/app/globals.css`.
- Offline tests: `tests/analysis/graph-visualization-fixture.mjs`,
  `graph-visualization.mjs`, `reference-graph.mjs`, `multisection.mjs`,
  `extraction-quality.mjs`, `representation-quality.mjs`, `explanations.mjs`,
  `tsconfig.json` (all under `tests/analysis/`).
- Browser tests: `tests/graph-visualization.spec.ts`, `tests/session.spec.ts`,
  `tests/topic-processing.spec.ts`, `tests/extraction-quality.spec.ts`.
- Documentation: this file, `README.md`, `docs/backend-contract-v2.md`.

## Run locally

With Node 22+ and installed dependencies, run `npm run dev`, then open
`http://localhost:3000`. Import/analyze a source with existing configuration;
choose a topic, select a concept or relationship, inspect evidence, and try Zoom,
Fit graph and Expand/Escape. These normal app operations may use the configured
AI; they were not invoked during this visualization verification.

For offline fixture verification, compile with
`node node_modules/typescript/bin/tsc -p tests/analysis/tsconfig.json`, then run
`node --test tests/analysis/graph-visualization.mjs` to generate the synthetic
browser fixture. Against a running local server, run
`npx playwright test tests/graph-visualization.spec.ts --output=test-results/graph-visualization/browser`;
its AI endpoints are mocked. The separate output directory preserves the generated
fixture (Playwright clears its own output directory at startup).
Set `PLAYWRIGHT_PORT` when the server uses a different port. Live tests remain
opt-in and are not needed for this change.

Layout references: [React Flow node measurements](https://reactflow.dev/api-reference/hooks/use-nodes-initialized),
[ELK with multiple handles](https://reactflow.dev/examples/layout/elkjs-multiple-handles),
[ELK orthogonal routing](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html).
