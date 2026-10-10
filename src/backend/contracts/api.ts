import type { EvaluationResult, SchemaVersion, SourceAnalysis } from "./domain";

export interface AnalyzeTextRequest {
  schemaVersion: SchemaVersion;
  source: { kind: "text"; text: string; title?: string };
}

/** Multipart metadata only. A separate `file` part supplies PDF bytes. */
export interface AnalyzePdfRequest {
  schemaVersion: SchemaVersion;
  source: { kind: "pdf"; title?: string };
}

export type AnalyzeSourceRequest = AnalyzeTextRequest | AnalyzePdfRequest;

export interface EvaluateTextRequest {
  schemaVersion: SchemaVersion;
  /** Full source payload is mandatory: no server-side ID lookup/storage assumed. */
  sourceAnalysis: SourceAnalysis;
  topicIds: string[];
  learner: { text: string };
}

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_SOURCE"
  | "PAYLOAD_TOO_LARGE"
  | "UNREADABLE_DOCUMENT"
  | "INVALID_SOURCE_ANALYSIS"
  | "ANALYSIS_FAILED"
  | "EVALUATION_FAILED"
  | "UPSTREAM_UNAVAILABLE";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  /** Paths into the submitted payload; never raw provider errors/secrets. */
  details?: { path: string; message: string }[];
}

export type ApiResponse<T> =
  | { ok: true; schemaVersion: SchemaVersion; data: T }
  | { ok: false; schemaVersion: SchemaVersion; error: ApiError };

export type AnalyzeSourceResponse = ApiResponse<SourceAnalysis>;
export type EvaluateTextResponse = ApiResponse<EvaluationResult>;
