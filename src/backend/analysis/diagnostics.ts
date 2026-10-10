import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
