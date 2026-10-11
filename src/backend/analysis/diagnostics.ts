import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ImportedSource, SourceAnalysis } from "../contracts/domain";
import type { AnalysisDraft } from "./draft";
import type { DraftIssue } from "./errors";

export interface AnalysisCapture {
  call: number;
  stage: string;
  importedSource: ImportedSource;
  outputText?: string;
  draft?: AnalysisDraft;
  normalized?: SourceAnalysis;
  issues?: DraftIssue[];
  code?: string;
}
export type CaptureAnalysis = (value: AnalysisCapture) => void;

/** Explicit local opt-in only; artifacts contain source text, never SDK/key data. */
export function createAnalysisCapture(requestId: string): CaptureAnalysis | undefined {
  if (process.env.NODE_ENV !== "development" || process.env.EXPLAINBACK_ANALYSIS_CAPTURE !== "1") return;
  return value => {
    try {
      const directory = join(process.cwd(), "test-results", "source-analysis-artifacts");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${requestId}-call-${value.call}.json`), JSON.stringify(value, null, 2));
    } catch { /* Capture failure must not change the API result. */ }
  };
}

/** Console-safe metadata: no raw error message, document, quote or field values. */
export function diagnosticIssues(issues: DraftIssue[]): NonNullable<AnalysisEvent["validationIssues"]> {
  return issues.slice(0, 20).map(issue => ({ path: issue.path.slice(0, 300), rule: issue.code,
    ...(issue.ids ? { ids: Object.fromEntries(Object.entries(issue.ids).filter(([key, value]) => /^[A-Za-z]+Id$/.test(key) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value))) } : {}) }));
}

/** Server-only metadata. Never pass source text, prompts, SDK errors or credentials. */
export interface AnalysisEvent {
  stage: string;
  call?: number;
  callElapsedMs?: number;
  timeoutMs?: number;
  timeoutOrigin?: "pipeline" | "sdk" | "upstream";
  code?: string;
  upstreamStatus?: number;
  upstreamCode?: string;
  retryAfterSeconds?: number;
  finishReason?: string;
  validation?: "passed" | "failed";
  failedStage?: string;
  purpose?: "initial" | "repair";
  model?: string;
  keyExists?: boolean;
  schemaBytes?: number;
  schemaHasArrayBounds?: boolean;
  outputCharacters?: number;
  thoughtsTokens?: number;
  outputTokens?: number;
  quotaLimits?: { metric: string; id: string }[];
  validationIssues?: { path: string; rule: DraftIssue["code"]; ids?: Record<string, string> }[];
}
export type AnalysisDiagnostic = (event: AnalysisEvent) => void;

export function createAnalysisDiagnostic(requestId: string): AnalysisDiagnostic {
  const started = Date.now();
  return event => {
    const line = JSON.stringify({ requestId, elapsedMs: Date.now() - started, ...event });
    console.info("[source-analysis]", line);
    // Ignored development-only metadata log permits tracing an existing dev process.
    // Logging must never fail or change the analysis result.
    if (process.env.NODE_ENV === "development") {
      try {
        const directory = join(process.cwd(), ".next", "dev", "logs");
        mkdirSync(directory, { recursive: true });
        appendFileSync(join(directory, "source-analysis.jsonl"), `${line}\n`);
      } catch { /* Console logging remains available. */ }
    }
  };
}

/** Numeric delay only; no raw headers are exposed or logged. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}
