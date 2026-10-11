"use client";
import { useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, FileText, Keyboard, Mic } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import { TranscriptEditor } from "./TranscriptEditor";
import type { TranscriptionResult } from "@/backend/contracts/api";

interface Props {
  title: string; explanationText: string; explanationFile: File | null; audioFile: File | null;
  onExplanationText: (text: string) => void; onExplanationFile: (file: File | null) => void;
  onAudioFile: (file: File | null) => void; onBack: () => void;
  onTranscribe: () => void; onImportFile: () => void; onEvaluate: () => void;
  phase: "idle" | "transcribing" | "importing" | "evaluating";
  requestError: string; transcription: TranscriptionResult | null; canEvaluate: boolean;
}
export function RecorderPreview(props: Props) {
  const { title, explanationText, explanationFile, audioFile, onExplanationText, onExplanationFile, onAudioFile, onBack, onTranscribe, onImportFile, onEvaluate, phase, requestError, transcription, canEvaluate } = props;
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const busy = phase !== "idle";
  return <section aria-label="Your explanation">
    <div className="card explanation-card wide">
      <div className="card-heading"><div><Mic size={19} /><h2>{title.trim() || "Untitled lesson"}</h2></div><span className="small-label">TEXT OR VOICE</span></div>
      <div className="explanation-options"><div className="input-option">
        <div className="option-heading"><Mic size={18} /><div><h3>Record your explanation</h3><p>Transcription preserves what you say, including mistakes.</p></div></div>
        <AudioRecorder audioFile={audioFile} onAudioFile={onAudioFile} onError={setError} onTranscribe={onTranscribe} transcribing={phase === "transcribing"} disabled={phase === "evaluating" || phase === "importing"} onRecordingChange={setRecording} />
      </div><div className="input-option">
        <div className="option-heading"><Keyboard size={18} /><div><h3>Type or edit your explanation</h3><p>The text below is what Evaluate submits.</p></div></div>
        <label className="visually-hidden" htmlFor="explanation-text">Explanation text</label>
        <textarea id="explanation-text" rows={10} maxLength={10_000} placeholder="Explain the lesson in your own words..." value={explanationText} onChange={e => { onExplanationText(e.target.value); setError(""); }} />
        <div className="source-meta"><span>{explanationText.trim() ? explanationText.trim().split(/\s+/).length : 0} words</span><span>{(10_000 - explanationText.length).toLocaleString()} characters left</span></div>
        {transcription && <p className="fine-print" role="status">Transcript ready ({transcription.language}). You can edit it before evaluating.</p>}
        {transcription?.warnings.map((w, i) => <p className="notice" key={i}>{w}</p>)}
      </div></div>
      <div className="input-divider"><span>OR IMPORT A FILE</span></div>
      <div className="explanation-file-option"><div className="option-heading"><FileText size={18} /><div><h3>Upload your explanation</h3><p>Extract text from PDF or DOCX, then review it above.</p></div></div><TranscriptEditor file={explanationFile} onChange={file => { onExplanationFile(file); setError(""); }} onError={setError} />{explanationFile && <button className="button secondary" disabled={busy || recording} onClick={onImportFile}>{phase === "importing" ? "Importing explanation..." : "Import explanation text"}</button>}</div>
      {(error || requestError) && <div className="request-message error-message" role="alert"><AlertCircle size={17} /><span>{error || requestError} Your current input has been kept. You can retry or use text.</span></div>}
      <div className="card-bottom"><button className="button ghost" onClick={onBack}><ArrowLeft size={16} />Back to analysis</button><button className="button primary" disabled={!canEvaluate || busy || recording || !!explanationFile} onClick={onEvaluate}>{phase === "evaluating" ? "Evaluating..." : "Evaluate"}<ArrowRight size={17} /></button></div>
      <p className="fine-print preview-note" role="status">{phase === "transcribing" ? "Transcribing your recording..." : phase === "evaluating" ? "Comparing your explanation with source evidence..." : "Evaluation covers all source topics. Missing means an idea is not expressed in this explanation."}</p>
    </div>
  </section>;
}
