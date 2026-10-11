import type { AnalyzeImportedSourceRequest } from "../contracts/api";
import type { SourceAnalysis } from "../contracts/domain";
import { validateAnalyzeImportedSourceRequest, validateImportedAnalysisResponse } from "../contracts/validate";
import { SOURCE_LIMITS } from "../contracts/source-limits";
import { ANALYSIS_DRAFT_SCHEMA, parseDraft, type AnalysisDraft } from "./draft";
import { AnalysisError, DraftError } from "./errors";
import { ANALYSIS_LIMITS as L } from "./limits";
import { normalizeAnalysisDraft, isExplicitQuestionText } from "./normalize";
import { buildAnalysisPrompt, ANALYSIS_SYSTEM_INSTRUCTION, type AnalysisRepair } from "./prompt";
import type { AnalysisProvider, AnalysisProviderResponse } from "./provider";
import { diagnosticIssues, type AnalysisDiagnostic, type CaptureAnalysis } from "./diagnostics";

export function validateAnalysisInput(input: unknown): AnalyzeImportedSourceRequest {
  const validation = validateAnalyzeImportedSourceRequest(input);
  if (!validation.valid) throw new AnalysisError("INVALID_REQUEST", 400, "Expected a consistent ImportedSource and optional outputLanguage source/en/vi.");
  const request = validation.value;
  const source = request.importedSource;
  if (source.normalizedText.length > L.sourceCharacters || source.metadata.originalCharacterCount > L.sourceCharacters || source.document.blocks.length > L.blocks) throw new AnalysisError("PAYLOAD_TOO_LARGE", 413, "Analysis supports at most 20,000 UTF-16 source characters and 120 blocks. No content was truncated.");
  if (source.document.blocks.some(b => b.text.length > SOURCE_LIMITS.blockCharacters) ||
    (source.metadata.fileSizeBytes ?? 0) > SOURCE_LIMITS.fileBytes || (source.metadata.pageCount ?? 0) > SOURCE_LIMITS.pdfPages ||
    (source.document.title?.length ?? 0) > SOURCE_LIMITS.titleCharacters) throw new AnalysisError("INVALID_REQUEST", 400, "ImportedSource exceeds the ingestion contract limits.");
  if (source.document.blocks.every(b => isExplicitQuestionText(b.text))) throw new AnalysisError("NO_EXTRACTABLE_KNOWLEDGE", 422, "Source contains explicit questions only. This endpoint does not infer answers.");
  // Own a snapshot so asynchronous providers cannot race changes to caller state.
  return structuredClone(request);
}

async function callProvider(provider: AnalysisProvider, request: AnalyzeImportedSourceRequest, timeoutMs: number, repair?: AnalysisRepair, diagnostic?: AnalysisDiagnostic): Promise<AnalysisProviderResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        diagnostic?.({ stage: "call_timeout", timeoutOrigin: "pipeline", timeoutMs });
        controller.abort(); reject(new AnalysisError("AI_TIMEOUT", 504, "Source analysis timed out.", true));
      }, timeoutMs); }),
      provider.generate({ systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION, prompt: buildAnalysisPrompt(request, repair),
        schema: ANALYSIS_DRAFT_SCHEMA, maxOutputTokens: L.outputTokens, signal: controller.signal }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export interface AnalysisRunOptions { callTimeoutMs?: number; totalTimeoutMs?: number; retryDelayMs?: number; diagnostic?: AnalysisDiagnostic; capture?: CaptureAnalysis }
/** Inject providers for tests; the HTTP route only creates the real Gemini provider. */
export async function analyzeImportedSource(input: unknown, provider: AnalysisProvider, options: AnalysisRunOptions = {}): Promise<SourceAnalysis> {
  const request = validateAnalysisInput(input);
  // Tests can shorten durations, never widen production ceilings or the call budget.
  const timeout = Math.max(1, Math.min(L.callTimeoutMs, options.callTimeoutMs ?? L.callTimeoutMs));
  const deadline = Date.now() + Math.max(1, Math.min(L.totalTimeoutMs, options.totalTimeoutMs ?? L.totalTimeoutMs));
  let repair: AnalysisRepair | undefined;
  const diagnostic = options.diagnostic;
  for (let attempt = 0; attempt < L.maxCalls; attempt++) {
    const started = Date.now();
    let stage = "call";
    let outputText: string | undefined, draft: AnalysisDraft | undefined, normalized: SourceAnalysis | undefined;
    const capture = (error?: AnalysisError) => {
      try { options.capture?.({ call: attempt + 1, stage, importedSource: request.importedSource, outputText, draft, normalized,
        ...(error ? { code: error.code, ...(error instanceof DraftError ? { issues: error.issues } : {}) } : {}) }); }
      catch { /* Diagnostic observers never change analysis success or failure. */ }
    };
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new AnalysisError("AI_TIMEOUT", 504, "Source analysis timed out.", true);
      diagnostic?.({ stage: "call_start", call: attempt + 1, purpose: repair ? "repair" : "initial", timeoutMs: Math.min(timeout, remaining) });
      const result = await callProvider(provider, request, Math.min(timeout, remaining), repair, diagnostic);
      outputText = result.text;
      diagnostic?.({ stage: "call_result", call: attempt + 1, callElapsedMs: Date.now() - started, finishReason: result.finishReason, outputCharacters: result.text.length });
      if (result.finishReason === "truncated") throw new AnalysisError("AI_OUTPUT_TRUNCATED", 502, "AI output was truncated. No partial analysis was returned.");
      if (result.finishReason !== "stop") throw new AnalysisError("ANALYSIS_FAILED", 422, "AI did not complete a usable source analysis.");
      stage = "draft_validation";
      draft = parseDraft(result.text);
      diagnostic?.({ stage, call: attempt + 1, validation: "passed" });
      stage = "domain_validation";
      const analysis = normalizeAnalysisDraft(request.importedSource, draft, candidate => { normalized = candidate; });
      const bound = validateImportedAnalysisResponse(request, { ok: true, schemaVersion: "2.0", data: analysis });
      if (!bound.valid) throw new DraftError("Analysis did not preserve the imported source and warnings.", bound.issues);
      diagnostic?.({ stage, call: attempt + 1, validation: "passed" });
      capture();
      return analysis;
    } catch (error) {
      const safe = error instanceof AnalysisError ? error : new AnalysisError("UPSTREAM_UNAVAILABLE", 503, "AI service could not be reached.", true);
      capture(safe);
      // Only invalid completed output gets one repair. Never retry provider failures
      // here: the service may still run or require a cooldown/Retry-After.
      diagnostic?.({ stage: "call_failed", call: attempt + 1, callElapsedMs: Date.now() - started, code: safe.code,
        failedStage: stage,
        ...(safe instanceof DraftError && safe.issues.length ? { validationIssues: diagnosticIssues(safe.issues) } : {}),
        ...(stage !== "call" ? { validation: "failed" as const } : {}) });
      // Surface provider overload instead of retrying after 250ms or ignoring Retry-After.
      const mayRetry = safe instanceof DraftError;
      if (!mayRetry || attempt + 1 === L.maxCalls) throw safe;
      repair = safe instanceof DraftError ? { error: safe.message, issues: safe.issues.slice(0, 20), ...(draft ? { previousDraft: draft } : {}) } : undefined;
      diagnostic?.({ stage: "repair_scheduled", call: attempt + 2, code: safe.code });
      const delay = Math.max(0, Math.min(L.retryDelayMs, options.retryDelayMs ?? L.retryDelayMs));
      if (Date.now() + delay >= deadline) throw new AnalysisError("AI_TIMEOUT", 504, "Source analysis timed out.", true);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new AnalysisError("ANALYSIS_FAILED", 500, "Source analysis failed.");
}
