import { GoogleGenAI, ApiError } from "@google/genai";
import type { AnalysisProvider, AnalysisProviderRequest } from "./provider";
import { AnalysisError } from "./errors";
import { ANALYSIS_LIMITS } from "./limits";

/** Backend-only configuration. No fallback model or client-visible API key. */
export function createGeminiProvider(env: NodeJS.ProcessEnv = process.env, fetchImplementation?: typeof fetch): AnalysisProvider {
  if (typeof window !== "undefined") throw new AnalysisError("AI_NOT_CONFIGURED", 503, "AI configuration is available only on the server.");
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  if (!apiKey || !model || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) throw new AnalysisError("AI_NOT_CONFIGURED", 503, "Configure GEMINI_API_KEY and a supported GEMINI_MODEL on the server.");
  const ai = new GoogleGenAI({ apiKey, vertexai: false, httpOptions: {
    timeout: ANALYSIS_LIMITS.callTimeoutMs, retryOptions: { attempts: 1 },
    ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
  } });
  return {
    async generate(request: AnalysisProviderRequest) {
      try {
        const result = await ai.models.generateContent({ model, contents: request.prompt, config: {
          systemInstruction: request.systemInstruction, responseMimeType: "application/json",
          responseJsonSchema: request.schema, maxOutputTokens: request.maxOutputTokens,
          candidateCount: 1, abortSignal: request.signal,
        } });
        const candidate = result.candidates?.[0];
        const reason = candidate?.finishReason;
        return {
          text: result.text ?? "",
          finishReason: reason === "MAX_TOKENS" ? "truncated" : reason === "STOP" && !result.promptFeedback?.blockReason ? "stop" : "blocked",
        };
      } catch (error) {
        if (request.signal.aborted || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) throw new AnalysisError("AI_TIMEOUT", 504, "Source analysis timed out.", true);
        if (error instanceof ApiError) {
          if ([408, 504].includes(error.status)) throw new AnalysisError("AI_TIMEOUT", 504, "Source analysis timed out.", true);
          if (error.status === 429) throw new AnalysisError("AI_RATE_LIMITED", 429, "AI rate limit reached. Try again later.", true);
          if ([400, 401, 403, 404].includes(error.status)) throw new AnalysisError("AI_NOT_CONFIGURED", 503, "AI credentials, model, or structured-output configuration were rejected.");
          if (error.status >= 500) throw new AnalysisError("UPSTREAM_UNAVAILABLE", 503, "AI service is temporarily unavailable.", true);
        }
        throw new AnalysisError("UPSTREAM_UNAVAILABLE", 503, "AI service could not be reached.", true);
      }
    },
  };
}
