import { GoogleGenAI, ApiError } from "@google/genai";
import type { AnalysisProvider, AnalysisProviderRequest } from "./provider";
import { AnalysisError } from "./errors";
import { ANALYSIS_LIMITS } from "./limits";
import { retryAfterSeconds, type AnalysisDiagnostic } from "./diagnostics";

/** Array bounds in the full draft schema trigger Gemini request rejection.
 * Keep structured shape/required fields, but enforce collection bounds locally.
 * Copy schema nodes so the original runtime validator schema remains unchanged.
 */
function providerSchema(rule: AnalysisProviderRequest["schema"]): AnalysisProviderRequest["schema"] {
  const result = { ...rule };
  delete result.minItems;
  delete result.maxItems;
  if (rule.items) result.items = providerSchema(rule.items);
  if (rule.properties) result.properties = Object.fromEntries(Object.entries(rule.properties).map(([name, child]) => [name, providerSchema(child)]));
  return result;
}

/** Backend-only configuration. No fallback model or client-visible API key. */
export function createGeminiProvider(env: NodeJS.ProcessEnv = process.env, fetchImplementation?: typeof fetch, diagnostic?: AnalysisDiagnostic): AnalysisProvider {
  if (typeof window !== "undefined") throw new AnalysisError("AI_NOT_CONFIGURED", 503, "AI configuration is available only on the server.");
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  if (!apiKey || !model || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) throw new AnalysisError("AI_NOT_CONFIGURED", 503, "Configure GEMINI_API_KEY and a supported GEMINI_MODEL on the server.");
  diagnostic?.({ stage: "provider_configured", model, keyExists: true });
  let retryAfter: number | undefined;
  const transport: typeof fetch = async (url, options) => {
    const response = await (fetchImplementation ?? fetch)(url, options);
    retryAfter = retryAfterSeconds(response.headers.get("retry-after"));
    let upstreamCode: string | undefined;
    let quotaLimits: { metric: string; id: string }[] | undefined;
    if (!response.ok) {
      const body = await response.clone().json().catch(() => null);
      const status = body?.error?.status;
      if (typeof status === "string" && /^[A-Z_]{1,64}$/.test(status)) upstreamCode = status;
      if (response.status === 429 && Array.isArray(body?.error?.details)) {
        const safeName = (value: unknown): string => typeof value === "string" && /^[A-Za-z0-9_./-]{1,200}$/.test(value) ? value : "unspecified";
        quotaLimits = body.error.details.flatMap((detail: { violations?: { quotaMetric?: unknown; quotaId?: unknown }[]; retryDelay?: unknown }) => {
          if (retryAfter === undefined && typeof detail.retryDelay === "string" && /^\d+(?:\.\d+)?s$/.test(detail.retryDelay)) retryAfter = Math.ceil(parseFloat(detail.retryDelay));
          return Array.isArray(detail.violations) ? detail.violations.slice(0, 10).map(v => ({ metric: safeName(v.quotaMetric), id: safeName(v.quotaId) })) : [];
        }).slice(0, 10);
      }
    }
    diagnostic?.({ stage: "upstream_response", upstreamStatus: response.status, upstreamCode, retryAfterSeconds: retryAfter, quotaLimits });
    return response;
  };
  const ai = new GoogleGenAI({ apiKey, vertexai: false, httpOptions: {
    timeout: ANALYSIS_LIMITS.callTimeoutMs, retryOptions: { attempts: 1 },
    fetch: transport,
  } });
  return {
    async generate(request: AnalysisProviderRequest) {
      const started = Date.now();
      retryAfter = undefined;
      try {
        const schema = providerSchema(request.schema);
        diagnostic?.({ stage: "sdk_request", schemaBytes: JSON.stringify(schema).length,
          schemaHasArrayBounds: /"(?:minItems|maxItems)":/.test(JSON.stringify(schema)), timeoutMs: ANALYSIS_LIMITS.callTimeoutMs });
        const contents = request.audio ? [{ role: "user", parts: [{ text: request.prompt }, { inlineData: request.audio }] }] : request.prompt;
        const result = await ai.models.generateContent({ model, contents, config: {
          systemInstruction: request.systemInstruction, responseMimeType: "application/json",
          responseJsonSchema: schema, maxOutputTokens: request.maxOutputTokens,
          candidateCount: 1, abortSignal: request.signal,
        } });
        const candidate = result.candidates?.[0];
        const reason = candidate?.finishReason;
        diagnostic?.({ stage: "sdk_result", callElapsedMs: Date.now() - started, finishReason: reason,
          thoughtsTokens: result.usageMetadata?.thoughtsTokenCount, outputTokens: result.usageMetadata?.candidatesTokenCount });
        return {
          text: result.text ?? "",
          finishReason: reason === "MAX_TOKENS" ? "truncated" : reason === "STOP" && !result.promptFeedback?.blockReason ? "stop" : "blocked",
        };
      } catch (error) {
        if (request.signal.aborted || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) {
          diagnostic?.({ stage: "sdk_timeout", callElapsedMs: Date.now() - started, timeoutOrigin: request.signal.aborted ? "pipeline" : "sdk" });
          throw new AnalysisError("AI_TIMEOUT", 504, "Source analysis timed out.", true);
        }
        if (error instanceof ApiError) {
          if ([408, 504].includes(error.status)) {
            diagnostic?.({ stage: "upstream_timeout", callElapsedMs: Date.now() - started, timeoutOrigin: "upstream", upstreamStatus: error.status });
            throw new AnalysisError("AI_TIMEOUT", 504, "Gemini returned an upstream timeout.", true);
          }
          if (error.status === 429) throw new AnalysisError("AI_RATE_LIMITED", 429, "AI rate limit reached. Try again later.", true, retryAfter);
          if (error.status === 401 || (error.status === 400 && /API_KEY_INVALID|API_KEY_EXPIRED|API key (?:not valid|is invalid|has expired)/i.test(error.message))) throw new AnalysisError("AI_NOT_CONFIGURED", 503, "Gemini rejected GEMINI_API_KEY. Check the server key and its validity.");
          if (error.status === 403) throw new AnalysisError("AI_NOT_CONFIGURED", 503, "Gemini denied access. Check the server key restrictions, project permissions, and model access.");
          if (error.status === 404) throw new AnalysisError("AI_NOT_CONFIGURED", 503, "GEMINI_MODEL was not found or does not support generateContent. Select an available model ID from Gemini ListModels.");
          // Request/schema rejection is not a missing key or an invalid generated draft.
          // Inspect upstream text only for classification; never return it to callers.
          if (error.status === 400) throw new AnalysisError("ANALYSIS_FAILED", 500,
            /response[_ .]?(?:json[_ .]?schema|schema|format|mime[_ .]?type)|generation[_ .]?config|schema/i.test(error.message)
              ? "Gemini rejected the structured-output schema or generation configuration. Check the backend adapter compatibility."
              : "Gemini rejected the analysis request with INVALID_ARGUMENT. Check the backend request configuration; this does not establish a key or model error.");
          if (error.status >= 500) throw new AnalysisError("UPSTREAM_UNAVAILABLE", 503, "AI service is temporarily unavailable.", true, retryAfter);
        }
        throw new AnalysisError("UPSTREAM_UNAVAILABLE", 503, "AI service could not be reached.", true);
      }
    },
  };
}
