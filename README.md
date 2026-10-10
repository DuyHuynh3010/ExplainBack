# ExplainBack

An educational workspace with a local UI demo and a source-ingestion backend. The demo flows from learning source → simulated explanation → sample understanding map. Built with Next.js App Router, TypeScript, Tailwind CSS, and React Flow. All UI session state is local React state and resets on reload.

## Team documentation

Read the [GitHub Workflow & Team Rules (PDF)](docs/github-workflow-and-team-rules.pdf) for the project's collaboration workflow and team rules. The original PDF is included in the repository and is available after cloning.

## Run locally

Requires Node.js 22 or later. Source ingestion uses `unpdf`, which requires Node.js 22+.

```sh
npm install
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build` and `npm start`.

## Structure

- `src/components/AppShell.tsx`: session state and view transitions.
- `StepIndicator`, `SourceInput`: progress and editable source material.
- `RecorderPreview`, `TranscriptEditor`: simulated recording, cleaned-up timers, editable sample transcript.
- `UnderstandingMap`, `EvaluationDetails`, `StatusBadge`: fixed-position graph, keyboard-accessible relationship list, evidence and status counts.
- `src/fixtures/photosynthesis.ts`: deterministic source, transcript, six nodes and five relationships; summary derives from these relationships.
- `src/types/lesson.ts`: shared step, status and relationship types.

## Checks

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Playwright tests the full session at 390px and 1440px, empty-source validation, preserved edits, timer progression, evidence selection, fixture consistency, reset, horizontal overflow, browser errors, and unexpected external requests/microphone access.

## Prototype limits and next integration points

The existing UI still uses local demo data. A separate backend source-ingestion
endpoint, `POST /api/sources`, accepts text, PDF, and DOCX without AI analysis.
See [Source ingestion (Block 2)](docs/source-ingestion.md) for request/response
examples, limits, PowerShell commands, and frontend integration guidance.

The recorder does not access a microphone. The transcript and results are fixed photosynthesis fixtures regardless of what is entered. The UI does not upload, transcribe, or evaluate input. The separate source-ingestion backend processes text/PDF/DOCX without authentication, storage, AI, scoring, or cloud deployment.

TODO markers in `RecorderPreview.tsx` identify future recording, transcription, and evaluation integration points. Keep their eventual data contracts separate from the UI components. These integrations are intentionally unimplemented in this version.
