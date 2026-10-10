"use client";
import { useEffect, useRef, useState } from "react";
import type { EvaluateTextRequest, TranscriptionResult } from "@/backend/contracts/api";
import type { EvaluationResult } from "@/backend/contracts/domain";
import { transcribeAudio } from "./transcription";
import { evaluateExplanation } from "./evaluation";
import { importLearningSource } from "./source-ingestion";
import { EXPLANATION_LIMITS as L } from "@/backend/contracts/explanation-limits";

/** Revision + abort guards also cover providers that finish after cancellation. */
export function useExplanation() {
  const [phase, setPhase] = useState<"idle" | "transcribing" | "importing" | "evaluating">("idle");
  const [error, setError] = useState("");
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const revision = useRef(0), active = useRef<AbortController | null>(null);
  const importedFile = useRef<{ file: File; text: string } | null>(null);
  function invalidate(clearTranscript = false) {
    revision.current++; active.current?.abort(); active.current = null;
    setPhase("idle"); setError(""); setEvaluation(null);
    if (clearTranscript) { setTranscription(null); importedFile.current = null; }
  }
  useEffect(() => () => { revision.current++; active.current?.abort(); }, []);
  async function run<T>(nextPhase: typeof phase, operation: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    if (active.current) return null;
    const version = revision.current, controller = new AbortController(); active.current = controller;
    setPhase(nextPhase); setError("");
    const timer = setTimeout(() => controller.abort(), L.timeoutMs + 10_000);
    try {
      const result = await operation(controller.signal);
      return version === revision.current ? result : null;
    } catch (failure) {
      if (version === revision.current) setError(controller.signal.aborted ? "The request timed out. Your input has been kept; retry when ready." : failure instanceof Error ? failure.message : "The request failed. Your input has been kept.");
      return null;
    } finally {
      clearTimeout(timer);
      if (version === revision.current && active.current === controller) { active.current = null; setPhase("idle"); }
    }
  }
  async function transcribe(file: File): Promise<string | null> {
    const data = await run("transcribing", signal => transcribeAudio(file, signal));
    if (!data) return null;
    setTranscription(data); return data.transcript;
  }
  async function importFile(file: File): Promise<string | null> {
    if (importedFile.current?.file === file) return importedFile.current.text;
    const data = await run("importing", signal => importLearningSource({ title: "Learner explanation", text: "", file }, signal));
    if (!data) return null;
    if (data.normalizedText.length > L.learnerCharacters) { setError("The explanation exceeds 10,000 characters. Shorten the document or type a shorter explanation."); return null; }
    importedFile.current = { file, text: data.normalizedText }; return data.normalizedText;
  }
  async function evaluate(input: EvaluateTextRequest) {
    const data = await run("evaluating", signal => evaluateExplanation(input, signal));
    if (data) setEvaluation(data);
  }
  return { phase, error, transcription, evaluation, invalidate, transcribe, importFile, evaluate };
}
