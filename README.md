# ExplainBack

[Multi-section source analysis](docs/topic-processing.md) implements bounded sequential
processing, local retry checkpoints and topic graph/summary switching on contract 2.0.

An educational workspace that imports text/PDF/DOCX, analyzes sources through Gemini, and displays topic summaries and a reference knowledge graph. Built with Next.js App Router, TypeScript, Tailwind CSS, and React Flow. All UI session state is local React state and resets on reload. Voice transcription, editable explanations and evidence-based learner feedback are available through backend Gemini endpoints.

## Team documentation

Read the [GitHub Workflow & Team Rules (PDF)](docs/github-workflow-and-team-rules.pdf) for the project's collaboration workflow and team rules. The original PDF is included in the repository and is available after cloning.

The current [graph/API contract is v2](docs/backend-contract-v2.md): document-wide
concepts, binary relationships and complex statement cards. Reset/re-import v1
sessions. See [verification results and remaining live extraction gaps](docs/graph-v2-verification.md)
before treating a generated graph as verified knowledge.

[Extraction quality follow-up](docs/extraction-quality-v2.md) documents qualified
edge labels, source review diagnostics and statement-local repair. Offline checks
pass; the new real two-paragraph attempt was blocked by provider 503, so improved
live semantic coverage is not established.

## Run locally

Requires Node.js 22 or later. Source ingestion uses `unpdf`, which requires Node.js 22+.

```sh
npm install
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build` and `npm start`.

Configure the backend in your ignored `.env.local` before starting the server:

```sh
GEMINI_API_KEY=your-server-only-key
GEMINI_MODEL=your-supported-structured-output-model
```

Select Continue after entering text or a genuine PDF/DOCX. The app calls `/api/sources`, then `/api/analysis`, and opens source topics, summaries, graph and evidence. Files are limited to 3,000,000 bytes; analysis supports 20,000 UTF-16 characters and 120 blocks. Both requests stay on this Next.js server. API keys and the Gemini SDK are backend-only. See [UI integration](docs/ui-source-analysis.md) for walkthrough, state behavior, tests and live-test results.

## Structure

- `src/components/AppShell.tsx`: session state and view transitions.
- `StepIndicator`, `SourceInput`: progress and editable source material.
- `AudioRecorder`, `RecorderPreview`, `TranscriptEditor`: microphone recording, playback, editable transcripts, manual text, and PDF/DOCX explanation ingestion.
- `UnderstandingMap`, `ReferenceEdge`, `SourceEvidenceDetails`: topic graph, summaries, source evidence and a separate learner-feedback view.
- `src/lib/{source-ingestion,source-analysis,use-source-analysis,reference-graph}`: API clients, session orchestration and frontend layout adapter.
- `src/fixtures/photosynthesis.ts`: sample source text and legacy demo fixtures. The active graph never uses those fixtures as a fallback.
- `src/types/lesson.ts`: shared step, status and relationship types.

## Checks

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Playwright tests the session at 390px and 1440px, mock analysis, real PDF/DOCX ingestion with mock analysis, errors/retries, stale responses, reset, topic/evidence selection, neutral parallel edges, preserved explanation input, recording/playback and microphone denial. Live Gemini tests are opt-in and excluded from ordinary test execution. See the integration guide for the one-request live smoke command.

## Prototype limits and next integration points

A separate backend source-ingestion endpoint, `POST /api/sources`, accepts text,
PDF, and DOCX without AI analysis. See [Source ingestion (Block 2)](docs/source-ingestion.md)
for request/response examples, limits, PowerShell commands, and frontend integration guidance.

`POST /api/analysis` now accepts a complete ImportedSource and produces topics,
reference knowledge and lesson summaries through a backend Gemini adapter.
Set `GEMINI_API_KEY` and `GEMINI_MODEL` on the server; no default model is selected.
See [Source analysis (Block 3A)](docs/source-analysis.md) for configuration, limits,
tests and frontend handoff. The UI now sends the full ImportedSource and displays
the returned SourceAnalysis.

The recorder requests microphone access only after the user selects Start recording.
Source analysis is displayed before the learner explanation step. `/api/transcriptions`
accepts `audioFile` and returns editable text; `/api/evaluations` reuses the complete
ImportedSource/SourceAnalysis and returns validated feedback. See
[Transcription and evaluation](docs/source-explanations.md) for contracts, limits,
UI walkthrough, live verification and remaining accuracy limits.
There is no authentication, durable storage, scoring, or cloud deployment.

The learning-source input now calls `POST /api/sources`. It sends text with the
JSON contract and sends PDF/DOCX files in the `file` multipart field with an
optional `title`. The UI mirrors the backend's 3,000,000-byte source-file limit.
The explanation-file input uses the same PDF/DOCX ingestion endpoint, then exposes editable learner text.

The transcription and evaluation clients live in `src/lib/`; their implemented routes use the shared API envelope and server-only provider. Voice uses the configured audio-capable model, with an optional explicit server `GEMINI_TRANSCRIPTION_MODEL` override. No new dependency was added.
