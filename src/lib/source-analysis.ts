import type { AnalyzeImportedSourceRequest } from "@/backend/contracts/api";
import type { ImportedSource, SourceAnalysis } from "@/backend/contracts/domain";
import { validateImportedAnalysisResponse } from "@/backend/contracts/validate";

export async function analyzeLearningSource(importedSource: ImportedSource, signal?: AbortSignal): Promise<SourceAnalysis> {
  const request: AnalyzeImportedSourceRequest = { schemaVersion: "2.0", importedSource };
  const response = await fetch("/api/analysis", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal,
  });
  const result: unknown = await response.json().catch(() => null);
  const validation = validateImportedAnalysisResponse(request, result);
  if (!validation.valid) throw new Error("The analysis service returned an invalid response. Your source has been kept; try again.");
  if (!validation.value.ok) throw new Error(`${validation.value.error.code}: ${validation.value.error.message}`);
  if (!response.ok) throw new Error("The analysis request failed. Your source has been kept; try again.");
  return validation.value.data;
}
