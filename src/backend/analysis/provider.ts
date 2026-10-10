import type { ANALYSIS_DRAFT_SCHEMA } from "./draft";

export interface AnalysisProviderRequest {
  systemInstruction: string;
  prompt: string;
  schema: typeof ANALYSIS_DRAFT_SCHEMA;
  maxOutputTokens: number;
  signal: AbortSignal;
}
export interface AnalysisProviderResponse { text: string; finishReason: "stop" | "truncated" | "blocked" }
export interface AnalysisProvider {
  generate(request: AnalysisProviderRequest): Promise<AnalysisProviderResponse>;
}
