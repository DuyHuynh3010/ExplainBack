import type { TranscriptionResponse, TranscriptionResult } from "@/backend/contracts/api";
import { EXPLANATION_LIMITS as L } from "@/backend/contracts/explanation-limits";

export async function transcribeAudio(audioFile: File, signal?: AbortSignal): Promise<TranscriptionResult> {
  if (!audioFile.size || audioFile.size > L.audioBytes) throw new Error("Recording must contain audio and be at most 3,000,000 bytes.");
  const formData = new FormData();
  formData.append("audioFile", audioFile);
  const response = await fetch("/api/transcriptions", {
    method: "POST",
    body: formData,
    signal,
  });
  const body = await response.json().catch(() => null) as TranscriptionResponse | null;
  if (!response.ok || !body?.ok) throw new Error(body && !body.ok ? body.error.message : "Transcription failed. You can type your explanation instead.");
  if (body.schemaVersion !== "1.0" || typeof body.data?.transcript !== "string" || !body.data.transcript.trim() || body.data.transcript.length > L.learnerCharacters || typeof body.data.language !== "string" || !Array.isArray(body.data.warnings) || !body.data.warnings.every(w => typeof w === "string") || !body.data.audio || !["audio/webm", "audio/wav", "audio/m4a"].includes(body.data.audio.mimeType) || !Number.isInteger(body.data.audio.bytes) || body.data.audio.bytes <= 0 || body.data.audio.bytes > L.audioBytes) throw new Error("The transcription service returned an invalid transcript.");
  return body.data;
}
