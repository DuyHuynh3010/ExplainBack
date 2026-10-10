# ExplainBack

An educational workspace with source input, microphone recording, provisional transcription/evaluation clients, and a separate source-ingestion backend. The results view uses a sample understanding map. Built with Next.js App Router, TypeScript, Tailwind CSS, and React Flow. All UI session state is local React state and resets on reload.

## Team documentation

Read the [GitHub Workflow & Team Rules (PDF)](docs/github-workflow-and-team-rules.pdf) for the project's collaboration workflow and team rules. The original PDF is included in the repository and is available after cloning.

## Run locally

Requires Node.js 22 or later. Source ingestion uses `unpdf`, which requires Node.js 22+.

```sh
npm install
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build` and `npm start`.

To connect the text evaluation flow to a backend hosted elsewhere, create `.env.local`:

```sh
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

The learning-source screen imports pasted text or a genuine PDF/DOCX through `POST /api/sources`. Files are limited to 3,000,000 bytes. Text uses JSON; files use multipart fields named `file` and optional `title`. The learner can still record audio, type explanation text, or upload an explanation file. Recording and evaluation keep their provisional clients until those backend endpoints are implemented.

## Structure

- `src/components/AppShell.tsx`: session state and view transitions.
- `StepIndicator`, `SourceInput`: progress and editable source material.
- `AudioRecorder`, `RecorderPreview`, `TranscriptEditor`: microphone recording, playback, transcription, editable/manual text, and document input.
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

Playwright tests the full session at 390px and 1440px, empty-source validation, file inputs, preserved edits, recording/transcription with mocked services, microphone-denial fallback, evidence selection, fixture consistency, reset, horizontal overflow, browser errors, and unexpected external requests/microphone access.

## Prototype limits and next integration points

A separate backend source-ingestion endpoint, `POST /api/sources`, accepts text,
PDF, and DOCX without AI analysis. See [Source ingestion (Block 2)](docs/source-ingestion.md)
for request/response examples, limits, PowerShell commands, and frontend integration guidance.

`POST /api/analysis` now accepts a complete ImportedSource and produces topics,
reference knowledge and lesson summaries through a backend Gemini adapter.
Set `GEMINI_API_KEY` and `GEMINI_MODEL` on the server; no default model is selected.
See [Source analysis (Block 3A)](docs/source-analysis.md) for configuration, limits,
tests and frontend handoff. The existing UI has not been wired to this endpoint.

The recorder requests microphone access only after the user selects Start recording.
Transcription and evaluation require configured backend endpoints. The results view
still displays fixed photosynthesis fixtures until response rendering is integrated.
There is no authentication, durable storage, scoring, or cloud deployment.

The learning-source input now calls `POST /api/sources`. It sends text with the
JSON contract and sends PDF/DOCX files in the `file` multipart field with an
optional `title`. The UI mirrors the backend's 3,000,000-byte source-file limit.
The separate explanation-file input remains provisional until evaluation is implemented.

The transcription and evaluation clients live in `src/lib/`. Their routes and payloads remain provisional until the backend team finalizes those contracts.
