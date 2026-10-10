import type { AnalyzeSourceResponse } from "../contracts/api";
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

export async function handleAnalysisRequest(request: Request, providerFactory: () => AnalysisProvider = createGeminiProvider): Promise<Response> {
  try {
    // Validate before configuration/network, so invalid inputs never consume AI calls.
    const input = validateAnalysisInput(await readJson(request));
    const data = await analyzeImportedSource(input, providerFactory());
    const body: AnalyzeSourceResponse = { ok: true, schemaVersion: "1.0", data };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const safe = error instanceof AnalysisError ? error : new AnalysisError("ANALYSIS_FAILED", 500, "Source analysis could not be completed.");
    const body: AnalyzeSourceResponse = { ok: false, schemaVersion: "1.0", error: { code: safe.code, message: safe.message, retryable: safe.retryable } };
    return Response.json(body, { status: safe.status, headers: { "cache-control": "no-store" } });
  }
}
