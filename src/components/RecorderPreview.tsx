"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileText, Keyboard, LoaderCircle, Mic } from "lucide-react";
import { submitExplanation } from "@/lib/evaluation";
import { AudioRecorder } from "./AudioRecorder";
import { TranscriptEditor } from "./TranscriptEditor";

interface Props { title: string; source: string; sourceFile: File | null; explanationText: string; explanationFile: File | null; audioFile: File | null; onExplanationText: (text: string) => void; onExplanationFile: (file: File | null) => void; onAudioFile: (file: File | null) => void; onBack: () => void; onResults: () => void }

export function RecorderPreview({ title, source, sourceFile, explanationText, explanationFile, audioFile, onExplanationText, onExplanationFile, onAudioFile, onBack, onResults }: Props) {
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const [success, setSuccess] = useState(false);
 const requestController = useRef<AbortController | null>(null);

 useEffect(() => () => requestController.current?.abort(), []);

 async function evaluate() {
  if ((!explanationText.trim() && !explanationFile) || loading) return;
  setError("");
  setSuccess(false);
  setLoading(true);
  requestController.current = new AbortController();
  try {
   await submitExplanation({ lessonTitle: title.trim(), learningSource: source, learningSourceFile: sourceFile, explanationText, explanationFile }, requestController.current.signal);
   setSuccess(true);
   onResults();
  } catch (requestError) {
   if (requestError instanceof DOMException && requestError.name === "AbortError") return;
   setError(requestError instanceof Error ? requestError.message : "We couldn’t evaluate your explanation. Please try again.");
  } finally {
   setLoading(false);
   requestController.current = null;
  }
 }

 return <section aria-labelledby="explanation-heading"><div className="view-heading"><span className="eyebrow">STEP 02 · MAKE IT YOUR OWN</span><h1 id="explanation-heading">Share your explanation.</h1><p>Record an explanation and turn it into editable text, type it yourself, or upload a document.</p></div><div className="card explanation-card wide"><div className="card-heading"><div><Mic size={19} /><h2>{title.trim() || "Untitled lesson"}</h2></div><span className="small-label">TEXT OR FILE</span></div><div className="explanation-options"><div className="input-option"><div className="option-heading"><Mic size={18} /><div><h3>Record your explanation</h3><p>Record, listen back, then create a transcript.</p></div></div><AudioRecorder audioFile={audioFile} onAudioFile={onAudioFile} onTranscript={text => { onExplanationText(text); onExplanationFile(null); setError(""); setSuccess(false); }} onError={setError} disabled={loading} /></div><div className="input-option"><div className="option-heading"><Keyboard size={18} /><div><h3>Type your explanation</h3><p>Write directly or edit the transcript after recording.</p></div></div><label className="visually-hidden" htmlFor="explanation-text">Explanation text</label><textarea id="explanation-text" rows={10} maxLength={10_000} disabled={loading} placeholder="Explain the lesson in your own words…" value={explanationText} onChange={event => { onExplanationText(event.target.value); if (event.target.value.trim()) onExplanationFile(null); setError(""); setSuccess(false); }} /><div className="source-meta"><span>{explanationText.trim() ? explanationText.trim().split(/\s+/).length : 0} words</span><span>{(10_000 - explanationText.length).toLocaleString()} characters left</span></div></div></div><div className="input-divider"><span>OR SEND A FILE</span></div><div className="explanation-file-option"><div className="option-heading"><FileText size={18} /><div><h3>Upload your explanation</h3><p>Use a PDF, Word document, or Google Docs file.</p></div></div><TranscriptEditor file={explanationFile} onChange={file => { onExplanationFile(file); if (file) onExplanationText(""); setError(""); setSuccess(false); }} onError={setError} disabled={loading} /></div>{error && <div className="request-message error-message" role="alert"><AlertCircle size={17} /><span>{error} Your current input has been kept.</span></div>}{success && <div className="request-message success-message" role="status"><CheckCircle2 size={17} /><span>Explanation submitted successfully.</span></div>}<div className="card-bottom"><button className="button ghost" disabled={loading} onClick={onBack}><ArrowLeft size={16} />Back</button><button className="button primary" disabled={(!explanationText.trim() && !explanationFile) || loading} onClick={evaluate}>{loading ? <><LoaderCircle className="spin" size={17} />Evaluating…</> : <>Evaluate<ArrowRight size={17} /></>}</button></div><p className="fine-print preview-note" role="status">{loading ? "Sending your explanation for evaluation. Please keep this page open." : explanationText.trim() ? "Text will be sent for evaluation." : explanationFile ? "The selected file will be sent for evaluation." : "Choose one input method to continue."}</p></div></section>;
}
