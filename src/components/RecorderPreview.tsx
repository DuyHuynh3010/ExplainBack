"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Mic, Square, LoaderCircle } from "lucide-react";
import { sampleTranscript } from "@/fixtures/photosynthesis";
import { TranscriptEditor } from "./TranscriptEditor";
interface Props { title: string; transcript: string; revealed: boolean; onTranscript: (value: string) => void; onReveal: () => void; onBack: () => void; onResults: () => void }
export function RecorderPreview({ title, transcript, revealed, onTranscript, onReveal, onBack, onResults }: Props) {
 const [recording, setRecording] = useState(false);
 const [seconds, setSeconds] = useState(0);
 const [loading, setLoading] = useState(false);
 const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 useEffect(() => { if (!recording) return; const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer); }, [recording]);
 useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);
 function stop() {
  setRecording(false);
  // TODO: Connect recording and transcription after the prototype phase.
  if (!revealed) onTranscript(sampleTranscript);
  onReveal();
 }
 function preview() {
  // TODO: Replace the fixture preview with evaluation when that scope is approved.
  setLoading(true);
  previewTimer.current = setTimeout(onResults, 650);
 }
 return <section aria-labelledby="explanation-heading"><div className="view-heading"><span className="eyebrow">STEP 02 · MAKE IT YOUR OWN</span><h1 id="explanation-heading">Explain it in your words.</h1><p>Imagine teaching this lesson to someone who is hearing it for the first time.</p></div><div className="card explanation-card"><div className="card-heading"><div><Mic size={19} /><h2>{title.trim() || "Untitled lesson"}</h2></div><span className="small-label">DEMO RECORDING</span></div><div className={`recorder ${recording ? "recording" : ""}`}><span className="microphone"><Mic size={30} /></span><p className="recording-status" role="status">{recording ? "Demo recording in progress" : revealed ? "Sample transcript ready" : "Ready when you are"}</p><div className="timer" aria-label="Recording duration">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</div><div className="recorder-actions"><button className="button primary" disabled={recording || loading} onClick={() => { setSeconds(0); setRecording(true); }}><Mic size={16} />Start demo recording</button><button className="button secondary" disabled={!recording} onClick={stop}><Square size={13} />Stop</button></div><p className="fine-print">Simulation only — your microphone is not being used.</p></div>{revealed && <TranscriptEditor transcript={transcript} onChange={onTranscript} />}<div className="card-bottom"><button className="button ghost" disabled={loading} onClick={onBack}><ArrowLeft size={16} />Back</button><button className="button primary" disabled={!revealed || !transcript.trim() || recording || loading} onClick={preview}>{loading ? <><LoaderCircle className="spin" size={17} />Loading sample results…</> : <>Preview sample results<ArrowRight size={17} /></>}</button></div><p className="fine-print preview-note" role="status">{loading ? "Preparing fixed photosynthesis fixtures. Your input is not being evaluated." : "Results preview uses the photosynthesis demo, regardless of your input."}</p></div></section>;
}
