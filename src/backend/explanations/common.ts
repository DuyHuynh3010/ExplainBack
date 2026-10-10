import { randomUUID } from "node:crypto";
import { AnalysisError } from "../analysis/errors";
import { createAnalysisDiagnostic } from "../analysis/diagnostics";
import { createGeminiProvider } from "../analysis/gemini";
import type { AnalysisProvider, AnalysisProviderRequest } from "../analysis/provider";
import type { ApiResponse } from "../contracts/api";
import { EXPLANATION_LIMITS as L } from "../contracts/explanation-limits";

export const invalid = (message: string): never => { throw new AnalysisError("INVALID_REQUEST", 400, message); };
export const invalidOutput = (message: string): never => { throw new AnalysisError("AI_OUTPUT_INVALID", 502, message); };

export async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array> {
  if (!request.body) return invalid("Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new AnalysisError("PAYLOAD_TOO_LARGE", 413, "Request exceeds the supported byte limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Uint8Array(Buffer.concat(chunks, size));
}

export interface OperationContext {
  /** Exactly one generation; no repair or network retry. */
  generate(request: Omit<AnalysisProviderRequest, "signal">): ReturnType<AnalysisProvider["generate"]>;
}

export async function handleExplanationOperation<T>(
  request: Request, operation: "transcription" | "evaluation",
  work: (context: OperationContext) => Promise<T>, provider?: AnalysisProvider,
): Promise<Response> {
  const requestId = randomUUID();
  const diagnostic = createAnalysisDiagnostic(requestId);
  const headers: Record<string, string> = { "cache-control": "no-store", "x-request-id": requestId };
  let calls = 0;
  diagnostic({ stage: `${operation}_start` });
  try {
    const data = await work({ generate: async input => {
      if (++calls > 1) throw new AnalysisError("AI_OUTPUT_INVALID", 502, "Only one generation is allowed per operation.");
      const env = operation === "transcription" && process.env.GEMINI_TRANSCRIPTION_MODEL
        ? { ...process.env, GEMINI_MODEL: process.env.GEMINI_TRANSCRIPTION_MODEL } : process.env;
      const selected = provider ?? createGeminiProvider(env, undefined, diagnostic);
      diagnostic({ stage: `${operation}_generation`, call: calls });
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(L.timeoutMs)]);
      const result = await selected.generate({ ...input, signal });
      if (result.finishReason !== "stop") throw new AnalysisError(result.finishReason === "truncated" ? "AI_OUTPUT_TRUNCATED" : "AI_OUTPUT_INVALID", 502, "AI did not return a complete supported response.");
      return result;
    } });
    diagnostic({ stage: `${operation}_complete`, call: calls, validation: "passed" });
    return Response.json({ ok: true, schemaVersion: "1.0", data } satisfies ApiResponse<T>, { headers });
  } catch (error) {
    const safe = error instanceof AnalysisError ? error : new AnalysisError(operation === "transcription" ? "TRANSCRIPTION_FAILED" : "EVALUATION_FAILED", 500, `${operation === "transcription" ? "Transcription" : "Evaluation"} could not be completed.`);
    diagnostic({ stage: `${operation}_failed`, call: calls, validation: "failed", code: safe.code });
    if (safe.retryAfterSeconds !== undefined) headers["retry-after"] = String(safe.retryAfterSeconds);
    return Response.json({ ok: false, schemaVersion: "1.0", error: { code: safe.code, message: safe.message, retryable: safe.retryable } } satisfies ApiResponse<T>, { status: safe.status, headers });
  }
}
