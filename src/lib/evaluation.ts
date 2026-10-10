export interface EvaluationRequest {
  lessonTitle: string;
  learningSource: string;
  learningSourceFile?: File | null;
  explanationText?: string;
  explanationFile?: File | null;
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
    body: (() => {
      const formData = new FormData();
      formData.append("lessonTitle", payload.lessonTitle);
      formData.append("learningSource", payload.learningSource);
      if (payload.learningSourceFile) formData.append("learningSourceFile", payload.learningSourceFile);
      if (payload.explanationText?.trim()) formData.append("explanationText", payload.explanationText.trim());
      else if (payload.explanationFile) formData.append("explanationFile", payload.explanationFile);
      return formData;
    })(),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(errorBody?.message || "We couldn’t evaluate your explanation. Please try again.");
  }

  return response.json().catch(() => ({})) as Promise<EvaluationAccepted>;
}
