import type { AnalyzeSourceResponse } from "../contracts/api";
import { randomUUID } from "node:crypto";
import { createAnalysisDiagnostic, type AnalysisDiagnostic } from "./diagnostics";
import type { AnalysisProvider } from "./provider";
import { AnalysisError } from "./errors";
import { ANALYSIS_LIMITS } from "./limits";
import { createGeminiProvider } from "./gemini";
import { analyzeImportedSource, validateAnalysisInput } from "./pipeline";

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new AnalysisError("UNSUPPORTED_SOURCE", 415, "Analysis requires application/json with the full ImportedSource.");
  if (!request.body) throw new AnalysisError("INVALID_REQUEST", 400, "Analysis request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > ANALYSIS_LIMITS.requestBytes) { await reader.cancel(); throw new AnalysisError("PAYLOAD_TOO_LARGE", 413, "Analysis request exceeds 1,000,000 bytes."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length))); }
  catch { throw new AnalysisError("INVALID_REQUEST", 400, "Analysis request must be valid UTF-8 JSON."); }
}

export async function handleAnalysisRequest(request: Request, providerFactory: (diagnostic?: AnalysisDiagnostic) => AnalysisProvider = diagnostic => createGeminiProvider(process.env, undefined, diagnostic)): Promise<Response> {
  const requestId = randomUUID();
  const diagnostic = createAnalysisDiagnostic(requestId);
  diagnostic({ stage: "request_start" });
  const headers: Record<string, string> = { "cache-control": "no-store", "x-request-id": requestId };
  try {
    // Validate before configuration/network, so invalid inputs never consume AI calls.
    const input = validateAnalysisInput(await readJson(request));
    diagnostic({ stage: "input_validation", validation: "passed" });
    const data = await analyzeImportedSource(input, providerFactory(diagnostic), { diagnostic });
    const body: AnalyzeSourceResponse = { ok: true, schemaVersion: "1.0", data };
    diagnostic({ stage: "request_complete", validation: "passed" });
    return Response.json(body, { headers });
  } catch (error) {
    const safe = error instanceof AnalysisError ? error : new AnalysisError("ANALYSIS_FAILED", 500, "Source analysis could not be completed.");
    diagnostic({ stage: "request_failed", code: safe.code, retryAfterSeconds: safe.retryAfterSeconds });
    if (safe.retryAfterSeconds !== undefined) headers["retry-after"] = String(safe.retryAfterSeconds);
    const body: AnalyzeSourceResponse = { ok: false, schemaVersion: "1.0", error: { code: safe.code, message: safe.message, retryable: safe.retryable } };
    return Response.json(body, { status: safe.status, headers });
  }
}
