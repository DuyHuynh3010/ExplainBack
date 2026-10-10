import { handleAnalysisRequest } from "../../../backend/analysis/handler";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  return handleAnalysisRequest(request);
}
