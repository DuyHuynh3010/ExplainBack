import type { AnalyzeImportedSourceRequest } from "@/backend/contracts/api";
import type { ImportedSource, SourceAnalysis } from "@/backend/contracts/domain";
import { validateImportedAnalysisResponse } from "@/backend/contracts/validate";
import { planSourceParts, SECTION_LIMITS, type CompletedPart, type PartProgress } from "@/backend/analysis/sections";

export interface AnalysisCheckpoint { completedParts: CompletedPart[]; callsUsed: number }
export interface AnalysisProgress { completed: number; total: number; title: string }
export interface SectionCallbacks {
  checkpoint?: AnalysisCheckpoint;
  onCheckpoint?: (value: AnalysisCheckpoint) => void;
  onProgress?: (value: AnalysisProgress) => void;
}

export async function analyzeLearningSource(importedSource: ImportedSource, signal?: AbortSignal, callbacks: SectionCallbacks = {}): Promise<SourceAnalysis> {
  const request: AnalyzeImportedSourceRequest = { schemaVersion: "2.0", importedSource };
  const plan = planSourceParts(importedSource);
  if (plan.length > SECTION_LIMITS.parts) throw new Error("PAYLOAD_TOO_LARGE: This source needs more than six processing parts. Use fewer sections or a shorter source; no content was truncated.");
  if (new Set(plan.flatMap(p => p.topics.map(t => t.id))).size > 12) throw new Error("PAYLOAD_TOO_LARGE: Analysis supports at most twelve semantic topics. No content was truncated.");
  let checkpoint = callbacks.checkpoint ?? { completedParts: [], callsUsed: 0 };
  do {
  const sectioned = plan.length > 1 || plan[0]?.topics.length > 1;
  if (sectioned) callbacks.onProgress?.({ completed: checkpoint.completedParts.length, total: plan.length, title: plan[checkpoint.completedParts.length].title });
  const response = await fetch("/api/analysis", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, ...(sectioned ? { processing: checkpoint } : {}) }), signal,
  });
  const raw = await response.json().catch(() => null);
  if (signal?.aborted) throw new DOMException("Processing cancelled.", "AbortError");
  if (sectioned && raw?.processing) {
    const n = raw.processing.callsUsed;
    if (!Number.isInteger(n) || n < checkpoint.callsUsed || n > SECTION_LIMITS.generations) throw new Error("Invalid processing call budget returned by analysis service.");
    checkpoint = { ...checkpoint, callsUsed: n };
    callbacks.onCheckpoint?.(checkpoint);
  }
  if (sectioned && response.ok && raw?.ok === true && raw.schemaVersion === "2.0" && raw.data?.kind === "part_complete") {
    const p = raw.data as PartProgress, next = plan[checkpoint.completedParts.length];
    if (p.part?.partId !== next.id || p.completed !== checkpoint.completedParts.length + 1 || p.total !== plan.length || !Array.isArray(p.part.draft?.statements)) throw new Error("Invalid processing checkpoint returned by analysis service.");
    checkpoint = { ...checkpoint, completedParts: [...checkpoint.completedParts, p.part] };
    callbacks.onCheckpoint?.(checkpoint);
    continue;
  }
  const result: unknown = raw && typeof raw === "object" ? { ok: raw.ok, schemaVersion: raw.schemaVersion, ...(raw.ok ? { data: raw.data } : { error: raw.error }) } : raw;
  const validation = validateImportedAnalysisResponse(request, result);
  if (!validation.valid) throw new Error("The analysis service returned an invalid response. Your source has been kept; try again.");
  if (!validation.value.ok) throw new Error(`${validation.value.error.code}: ${validation.value.error.message}`);
  if (!response.ok) throw new Error("The analysis request failed. Your source has been kept; try again.");
  return validation.value.data;
  } while (checkpoint.completedParts.length < plan.length);
  throw new Error("Analysis ended without a complete validated graph.");
}
