import { handleTranscriptionRequest } from "../../../backend/explanations/transcription";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  return handleTranscriptionRequest(request);
}
