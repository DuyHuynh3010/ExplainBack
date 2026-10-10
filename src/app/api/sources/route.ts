import { handleSourceRequest } from "../../../backend/sources/handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleSourceRequest(request);
}
