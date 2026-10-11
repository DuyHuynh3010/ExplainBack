import type { ImportSourceResponse } from "../contracts/api";
import { SOURCE_LIMITS } from "../contracts/source-limits";
import { validateAnalyzeSourceRequest, validateImportedSource } from "../contracts/validate";
import { SourceImportError, tooLarge } from "./errors";
import { importFile, importText } from "./ingest";
import { normalizeTitle } from "./normalize";

async function boundedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new SourceImportError("INVALID_REQUEST", 400, "Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > SOURCE_LIMITS.requestBytes) {
        await reader.cancel();
        tooLarge("Request exceeds the allowed body size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks, length));
}

export async function handleSourceRequest(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    if (!["application/json", "multipart/form-data"].includes(mediaType)) throw new SourceImportError("UNSUPPORTED_SOURCE", 415, "Use application/json for text or multipart/form-data for a PDF/DOCX file.");
    // Count actual streamed bytes instead of trusting Content-Length.
    const bytes = await boundedBody(request);
    let source;
    if (mediaType === "application/json") {
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new SourceImportError("INVALID_REQUEST", 400, "Request must contain valid UTF-8 JSON."); }
      // Normalize optional title before reusing Block 1's non-empty-string schema.
      if (payload && typeof payload === "object" && "source" in payload && payload.source && typeof payload.source === "object" && "title" in payload.source) {
        const title = normalizeTitle(payload.source.title);
        if (title === undefined) delete payload.source.title; else payload.source.title = title;
      }
      const validation = validateAnalyzeSourceRequest(payload);
      if (!validation.valid || validation.value.source.kind !== "text") throw new SourceImportError("INVALID_REQUEST", 400, "JSON input must contain schemaVersion 2.0 and exactly one text source.");
      source = importText(validation.value.source.text, validation.value.source.title);
    } else {
      let form: FormData;
      try {
        // Parse only after the complete multipart byte size has been bounded.
        form = await new Response(bytes as BodyInit, { headers: { "content-type": contentType } }).formData();
      } catch { throw new SourceImportError("INVALID_REQUEST", 400, "Invalid multipart request."); }
      if ([...form.keys()].some(key => !["file", "title"].includes(key)) || form.getAll("file").length !== 1 || form.getAll("title").length > 1) throw new SourceImportError("INVALID_REQUEST", 400, "Multipart input must contain exactly one file and an optional title; no source text or extra fields.");
      const file = form.get("file");
      const title = form.get("title") ?? undefined;
      if (!file || typeof file === "string") throw new SourceImportError("INVALID_REQUEST", 400, "Multipart file must contain PDF/DOCX bytes.");
      if (file.size > SOURCE_LIMITS.fileBytes) tooLarge("File exceeds 3,000,000 bytes.");
      source = await importFile(new Uint8Array(await file.arrayBuffer()), title);
    }
    if (!validateImportedSource(source).valid) throw new SourceImportError("SOURCE_IMPORT_FAILED", 500, "Imported source failed contract validation.");
    const response: ImportSourceResponse = { ok: true, schemaVersion: "2.0", data: source };
    return Response.json(response, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    // Never log/return parser errors, stacks, or document contents.
    const safe = error instanceof SourceImportError ? error : new SourceImportError("SOURCE_IMPORT_FAILED", 500, "Source could not be imported.");
    const response: ImportSourceResponse = { ok: false, schemaVersion: "2.0", error: { code: safe.code, message: safe.message, retryable: false } };
    return Response.json(response, { status: safe.status, headers: { "cache-control": "no-store" } });
  }
}
