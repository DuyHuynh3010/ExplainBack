import { randomUUID } from "node:crypto";
import { AnalysisError, DraftError } from "../analysis/errors";
import { createAnalysisDiagnostic, createEvaluationCapture, diagnosticDetails, diagnosticIssues, type CaptureEvaluation, type AnalysisDiagnostic } from "../analysis/diagnostics";
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
  capture?: CaptureEvaluation;
  diagnostic: AnalysisDiagnostic;
  /** One initial generation; evaluation may request one scoped patch, no provider retry. */
  generate(request: Omit<AnalysisProviderRequest, "signal">, purpose?: "learner_representation_repair" | "learner_alignment_repair" | "learner_scoped_repair"): ReturnType<AnalysisProvider["generate"]>;
}

export async function handleExplanationOperation<T>(
  request: Request, operation: "transcription" | "evaluation",
  work: (context: OperationContext) => Promise<T>, provider?: AnalysisProvider, maximumCalls: 1 | 2 = 1,
): Promise<Response> {
  const requestId = randomUUID();
  const diagnostic = createAnalysisDiagnostic(requestId);
  const headers: Record<string, string> = { "cache-control": "no-store", "x-request-id": requestId };
  let calls = 0;
  diagnostic({ stage: `${operation}_start` });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(L.timeoutMs)]);
  try {
    const data = await work({ diagnostic, capture: operation === "evaluation" ? createEvaluationCapture(requestId) : undefined, generate: async (input, purpose) => {
      if (++calls > (operation === "evaluation" ? maximumCalls : 1)) throw new AnalysisError("AI_OUTPUT_INVALID", 502, "The operation's generation budget is exhausted.");
      if (signal.aborted) throw new AnalysisError("AI_TIMEOUT", 504, "The explanation operation timed out.", true);
      const env = operation === "transcription" && process.env.GEMINI_TRANSCRIPTION_MODEL
        ? { ...process.env, GEMINI_MODEL: process.env.GEMINI_TRANSCRIPTION_MODEL } : process.env;
      const selected = provider ?? createGeminiProvider(env, undefined, diagnostic);
      diagnostic({ stage: purpose === "learner_scoped_repair" ? "evaluation_scoped_repair" : purpose === "learner_representation_repair" ? "evaluation_representation_repair" : purpose === "learner_alignment_repair" ? "evaluation_alignment_repair" : `${operation}_generation`, call: calls, purpose: purpose ? "repair" : "initial" });
      const result = await selected.generate({ ...input, signal });
      if (result.finishReason !== "stop") throw new AnalysisError(result.finishReason === "truncated" ? "AI_OUTPUT_TRUNCATED" : "AI_OUTPUT_INVALID", 502, "AI did not return a complete supported response.");
      return result;
    } });
    diagnostic({ stage: `${operation}_complete`, call: calls, validation: "passed" });
    return Response.json({ ok: true, schemaVersion: "2.0", data } satisfies ApiResponse<T>, { headers });
  } catch (error) {
    const safe = error instanceof AnalysisError ? error : new AnalysisError(operation === "transcription" ? "TRANSCRIPTION_FAILED" : "EVALUATION_FAILED", 500, `${operation === "transcription" ? "Transcription" : "Evaluation"} could not be completed.`);
    diagnostic({ stage: `${operation}_failed`, call: calls, validation: "failed", code: safe.code,
      ...(error instanceof DraftError ? { validationIssues: diagnosticIssues(error.issues) } : {}) });
    if (safe.retryAfterSeconds !== undefined) headers["retry-after"] = String(safe.retryAfterSeconds);
    return Response.json({ ok: false, schemaVersion: "2.0", error: { code: safe.code, message: safe.message, retryable: safe.retryable,
      ...(error instanceof DraftError ? { details: diagnosticDetails(error.issues) } : {}) } } satisfies ApiResponse<T>, { status: safe.status, headers });
  }
}
