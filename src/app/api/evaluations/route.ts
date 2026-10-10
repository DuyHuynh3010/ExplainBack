import { handleEvaluationRequest } from "../../../backend/explanations/evaluation";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  return handleEvaluationRequest(request);
}
