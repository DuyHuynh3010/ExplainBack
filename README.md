# ExplainBack

A UI-only educational workspace: learning source → simulated explanation → sample understanding map. Built with Next.js App Router, TypeScript, Tailwind CSS, and React Flow. All session state is local React state and resets on reload.

## Team documentation

Read the [GitHub Workflow & Team Rules (PDF)](docs/github-workflow-and-team-rules.pdf) for the project's collaboration workflow and team rules. The original PDF is included in the repository and is available after cloning.

## Run locally

Requires Node.js 20.9 or later.

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

Playwright tests the full session at 390px and 1440px, empty-source validation, preserved edits, timer progression, evidence selection, fixture consistency, reset, horizontal overflow, browser errors, and unexpected external requests/microphone access.

## Prototype limits and next integration points

The recorder requests microphone access only after the user selects Start recording. Transcription and evaluation require configured backend endpoints. The results view still displays fixed photosynthesis fixtures until response rendering is integrated. There is no authentication, durable storage, scoring, or cloud deployment.

The transcription and evaluation clients live in `src/lib/`. Their routes and payloads remain provisional until the backend team finalizes those contracts.
