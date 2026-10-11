# Graph workspace fullscreen and Compare

This update changes presentation and local graph interaction only. It keeps the
graph 2.0 contracts, source/explanation IDs, API responses, and backend analysis
and evaluation unchanged. No dependencies were added.

## Interaction

- Expand targets the persistent graph workspace: view/topic selectors, controls,
  canvas, and collapsible details. The lesson summary, input forms, and long
  relationship list remain outside fullscreen.
- Native fullscreen synchronizes with `fullscreenchange`. Exit and Escape close
  it. Unsupported browsers use a viewport overlay; a rejected native request
  displays an error. Selection, topic, view, and viewport survive expansion.
- Desktop details sit beside the canvas. Mobile details use a scrollable drawer;
  Hide details exposes the full canvas. Canvas wheel zoom stays cursor anchored;
  panel wheel scroll does not zoom the graph. Dragging the canvas pans it.
- Selecting a comparison highlights only explicitly linked claims and focuses
  their nodes/cards at bounded zoom. Clear selection/background clears emphasis.
  Fullscreen resize does not repeatedly fit the graph.

## Meaning and provenance

Lesson claims use neutral dashed reference lines; Explanation claims use solid
lines and their evaluation status. Provenance and verdict are separate. A Lesson
claim is never labelled contradicted. Both is reserved for explicitly aligned,
correct claims whose assertion, representation, formula, conditions, and polarity
match; paraphrases can remain separate while still showing Correct.

Mismatched binary claims retain separate relationships. Mismatched complex claims
retain separate cards, with ungraded participant links. The single detail panel
shows Status, Lesson says, Your explanation says, and the backend Difference.
Full formulas and conditions are retained. Quotes, locations, verification, and
suggestions are expandable. Missing has no invented learner quote; additional
ideas remain ungraded and show no linked reference claim.

## Implementation

- `UnderstandingMap.tsx`: persistent workspace, cached view/topic selection,
  fullscreen focus handling, collapsed details, and outside-workspace content.
- `ExplanationGraphView.tsx`: one paired-claim detail panel.
- `comparison-graph.ts` / `reference-graph.ts`: provenance, conservative Both
  matching, actual pair selection, and moderate dimming.
- `ReferenceCanvas.tsx` / `graph-layout.ts`: bounded selected-pair focus and
  measured ELK layout (desktop rightward, mobile downward).
- `ReferenceEdge.tsx` / `KnowledgeNode.tsx` / `globals.css`: selectable labels,
  separate verdict/provenance styles, workspace layout, and mobile drawer.

## Offline verification

The fixture in `tests/analysis/compare-workspace.mjs` is hand-authored **synthetic
demo data**, passed through the existing normalizers and contract validators.
Its union formula subtracts the intersection in the Lesson and adds it in the
Explanation. It also covers all five statuses, Missing, additional ideas, and a
complex mismatch. It does not demonstrate AI semantic accuracy.

Adapter/layout checks: 25 passed, one existing saved-live-artifact case skipped
because its capture is unavailable. Browser verification: 22 affected offline
cases passed across desktop and mobile; two live cases were skipped. A broader
run also passed 50 existing session/explanation cases covering mocked source,
voice, retry, and input behavior. Typecheck and production build passed.

Screenshots in the ignored `test-results/compare-workspace/` directory are all
**fixture/mock screenshots, not live AI output**:

- `contradicted-desktop.png`, `contradicted-mobile.png`
- `fullscreen-desktop.png`, `fullscreen-mobile.png` (details expanded)
- `fullscreen-canvas-desktop.png`, `fullscreen-canvas-mobile.png` (details hidden)

Browser tests verify actual Chromium fullscreen, overlay fallback, rejection,
Escape/exit, all three views, topic changes, wheel anchoring, panning, panel
scrolling, and linked-pair visibility. View/topic/fullscreen interaction sends no
additional analysis/evaluation requests. All endpoints are mocked and the owned
test server blocks provider generations; this task used **zero AI calls**.

These checks cover automated Chromium desktop and mobile emulation. Physical
mobile browsers and a new live AI Compare run were not verified in this task.
