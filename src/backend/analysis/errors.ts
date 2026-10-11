import type { ApiErrorCode } from "../contracts/api";
import type { ValidationIssue } from "../contracts/validate";

/** Internal repair/debug details. Never part of the public API error envelope. */
export interface DraftIssue extends ValidationIssue { ids?: Record<string, string> }

export class AnalysisError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) { super(message); this.name = "AnalysisError"; }
}

/** Messages sent for repair are controlled labels, never upstream text/source data. */
export class DraftError extends AnalysisError {
  constructor(message: string, readonly issues: DraftIssue[] = []) { super("AI_OUTPUT_INVALID", 502, message); }
}
