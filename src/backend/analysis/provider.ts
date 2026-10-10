import type { ANALYSIS_DRAFT_SCHEMA } from "./draft";

export interface AnalysisProviderRequest {
  systemInstruction: string;
  prompt: string;
  schema: typeof ANALYSIS_DRAFT_SCHEMA;
  maxOutputTokens: number;
  signal: AbortSignal;
  /** Server-only inline audio; never included in diagnostics. */
  audio?: { mimeType: string; data: string };
}
export interface AnalysisProviderResponse { text: string; finishReason: "stop" | "truncated" | "blocked" }
export interface AnalysisProvider {
  generate(request: AnalysisProviderRequest): Promise<AnalysisProviderResponse>;
}
