"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Mic, Square } from "lucide-react";
import { submitExplanation } from "@/lib/evaluation";
import { TranscriptEditor } from "./TranscriptEditor";

interface Props { title: string; source: string; transcript: string; onTranscript: (value: string) => void; onBack: () => void; onResults: () => void }

export function RecorderPreview({ title, source, transcript, onTranscript, onBack, onResults }: Props) {
 const [recording, setRecording] = useState(false);
 const [seconds, setSeconds] = useState(0);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const [success, setSuccess] = useState(false);
 const requestController = useRef<AbortController | null>(null);

 useEffect(() => { if (!recording) return; const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer); }, [recording]);
 useEffect(() => () => requestController.current?.abort(), []);

 async function evaluate() {
  if (!transcript.trim() || loading) return;
  setError("");
  setSuccess(false);
  setLoading(true);
  requestController.current = new AbortController();
  try {
   await submitExplanation({ lessonTitle: title.trim(), learningSource: source, explanation: transcript.trim() }, requestController.current.signal);
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

 return <section aria-labelledby="explanation-heading"><div className="view-heading"><span className="eyebrow">STEP 02 · MAKE IT YOUR OWN</span><h1 id="explanation-heading">Explain it in your words.</h1><p>Type what you understand. Audio recording is still a demo until the next feature.</p></div><div className="card explanation-card"><div className="card-heading"><div><Mic size={19} /><h2>{title.trim() || "Untitled lesson"}</h2></div><span className="small-label">TEXT INPUT READY</span></div><TranscriptEditor transcript={transcript} onChange={value => { onTranscript(value); setError(""); setSuccess(false); }} disabled={loading} /><details className="demo-recorder"><summary>Try the demo recorder</summary><div className={`recorder ${recording ? "recording" : ""}`}><span className="microphone"><Mic size={30} /></span><p className="recording-status" role="status">{recording ? "Demo recording in progress" : "Recorder simulation"}</p><div className="timer" aria-label="Recording duration">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</div><div className="recorder-actions"><button className="button secondary" disabled={recording || loading} onClick={() => { setSeconds(0); setRecording(true); }}><Mic size={16} />Start demo recording</button><button className="button secondary" disabled={!recording} onClick={() => setRecording(false)}><Square size={13} />Stop</button></div><p className="fine-print">Simulation only — your microphone is not being used and no transcript is generated.</p></div></details>{error && <div className="request-message error-message" role="alert"><AlertCircle size={17} /><span>{error} Your explanation has been kept.</span></div>}{success && <div className="request-message success-message" role="status"><CheckCircle2 size={17} /><span>Explanation submitted successfully.</span></div>}<div className="card-bottom"><button className="button ghost" disabled={loading} onClick={onBack}><ArrowLeft size={16} />Back</button><button className="button primary" disabled={!transcript.trim() || recording || loading} onClick={evaluate}>{loading ? <><LoaderCircle className="spin" size={17} />Evaluating…</> : <>Evaluate<ArrowRight size={17} /></>}</button></div><p className="fine-print preview-note" role="status">{loading ? "Sending your explanation for evaluation. Please keep this page open." : "Your explanation is sent only when you select Evaluate."}</p></div></section>;
}
