import type { ImportSourceResponse } from "@/backend/contracts/api";
import type { ImportedSource } from "@/backend/contracts/domain";

export interface SourceInputPayload {
  title: string;
  text: string;
  file: File | null;
}

export async function importLearningSource(
  payload: SourceInputPayload,
  signal?: AbortSignal,
): Promise<ImportedSource> {
  const response = await fetch("/api/sources", {
    method: "POST",
    body: payload.file ? fileRequest(payload.file, payload.title) : textRequest(payload.text, payload.title),
    headers: payload.file ? undefined : { "content-type": "application/json" },
    signal,
  });
  const result = await response.json().catch(() => null) as ImportSourceResponse | null;
  if (!response.ok || !result?.ok) {
    throw new Error(result && !result.ok ? result.error.message : "We couldn’t import this learning source. Please try again.");
  }
  return result.data;
}

function textRequest(text: string, title: string): string {
  return JSON.stringify({
    schemaVersion: "1.0",
    source: { kind: "text", ...(title.trim() ? { title: title.trim() } : {}), text },
  });
}

function fileRequest(file: File, title: string): FormData {
  const formData = new FormData();
  formData.append("file", file);
  if (title.trim()) formData.append("title", title.trim());
  return formData;
}
