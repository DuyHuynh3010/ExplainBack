import type { ApiErrorCode } from "../contracts/api";

export class AnalysisError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly retryable = false,
  ) { super(message); this.name = "AnalysisError"; }
}

/** Messages sent for repair are controlled labels, never upstream text/source data. */
export class DraftError extends AnalysisError {
  constructor(message: string) { super("AI_OUTPUT_INVALID", 502, message); }
}
