export interface TranscriptionResult {
  transcript: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

export async function transcribeAudio(audioFile: File, signal?: AbortSignal): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("audioFile", audioFile);
  const response = await fetch(`${API_BASE_URL}/api/transcriptions`, {
    method: "POST",
    body: formData,
    signal,
  });
  const body = await response.json().catch(() => null) as { transcript?: string; data?: { transcript?: string }; message?: string } | null;
  if (!response.ok) throw new Error(body?.message || "We couldn’t transcribe this recording. You can try again or type your explanation.");
  const transcript = body?.transcript ?? body?.data?.transcript;
  if (!transcript?.trim()) throw new Error("The transcription service returned an empty transcript. You can try again or type your explanation.");
  return { transcript: transcript.trim() };
}
