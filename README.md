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

The learning source accepts pasted text or a file. The explanation accepts a file. Both upload controls support PDF, Word (`.doc`, `.docx`), and Google Docs (`.gdoc`) up to 10 MB. The frontend sends `POST /api/evaluations` as `multipart/form-data` with `lessonTitle`, `learningSource`, optional `learningSourceFile`, and `explanationFile`. If the environment variable is omitted, it calls the same-origin `/api/evaluations` route. The API adapter is isolated in `src/lib/evaluation.ts` so its provisional request shape can be updated when the backend contract is finalized.

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

The recorder does not access a microphone. The transcript and results are fixed photosynthesis fixtures regardless of what is entered. No data is uploaded, transcribed, or evaluated. There is no backend, authentication, storage, AI, scoring, PDF processing, or cloud deployment.

TODO markers in `RecorderPreview.tsx` identify future recording, transcription, and evaluation integration points. Keep their eventual data contracts separate from the UI components. These integrations are intentionally unimplemented in this version.
