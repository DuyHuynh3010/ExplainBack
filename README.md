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

The learning source accepts pasted text or a file. The learner can record audio and request a transcript, type or edit explanation text, or upload an explanation file. Document uploads support PDF, Word (`.doc`, `.docx`), and Google Docs (`.gdoc`) up to 10 MB. Recording uses the browser microphone and posts `audioFile` to `POST /api/transcriptions`. Evaluation sends `POST /api/evaluations` as `multipart/form-data` with the learning source plus exactly one learner input: `explanationText` or `explanationFile`. If the environment variable is omitted, calls use same-origin routes. API adapters are isolated in `src/lib/` so provisional request shapes can be updated when backend contracts are finalized.

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

The recorder requests microphone access only after the user selects Start recording.
Transcription and evaluation require configured backend endpoints. The results view
still displays fixed photosynthesis fixtures until response rendering is integrated.
There is no authentication, durable storage, scoring, or cloud deployment.

The UI's provisional file inputs accept PDF, DOC, DOCX, and GDOC up to 10 MB.
The separate source-ingestion API accepts only PDF/DOCX files up to 3,000,000 bytes
or JSON text. The UI does not call this endpoint yet; align formats, limits, and
payloads before connecting these flows.

The transcription and evaluation clients live in `src/lib/`. Their routes and payloads remain provisional until the backend team finalizes those contracts.
