import type { EvaluateTextRequest, EvaluateTextResponse } from "@/backend/contracts/api";
import type { EvaluationResult } from "@/backend/contracts/domain";
import { validateEvaluateTextResponse } from "@/backend/contracts/validate";

export async function evaluateExplanation(input: EvaluateTextRequest, signal?: AbortSignal): Promise<EvaluationResult> {
  const response = await fetch("/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
  const result = await response.json().catch(() => null) as EvaluateTextResponse | null;
  if (!response.ok || !result?.ok) throw new Error(result && !result.ok ? result.error.message : "Evaluation failed. Your explanation has been kept.");
  if (!validateEvaluateTextResponse(input, result).valid) throw new Error("The evaluation service returned invalid references or evidence.");
  return result.data;
}
