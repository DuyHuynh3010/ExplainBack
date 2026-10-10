export interface EvaluationRequest {
  lessonTitle: string;
  learningSource: string;
  explanation: string;
}

export interface EvaluationAccepted {
  evaluationId?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

export async function submitExplanation(
  payload: EvaluationRequest,
  signal?: AbortSignal,
): Promise<EvaluationAccepted> {
  const response = await fetch(`${API_BASE_URL}/api/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(errorBody?.message || "We couldn’t evaluate your explanation. Please try again.");
  }

  return response.json().catch(() => ({})) as Promise<EvaluationAccepted>;
}
