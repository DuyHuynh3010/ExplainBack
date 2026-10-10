"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { EXPLANATION_LIMITS as L } from "@/backend/contracts/explanation-limits";

interface Props {
 audioFile: File | null;
 onAudioFile: (file: File | null) => void;
 onError: (message: string) => void;
 disabled?: boolean;
 onTranscribe: () => void;
 transcribing?: boolean;
 onRecordingChange?: (value: boolean) => void;
}

function formatTime(seconds: number) {
 return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AudioRecorder({ audioFile, onAudioFile, onError, disabled = false, onTranscribe, transcribing = false, onRecordingChange }: Props) {
 const [recording, setRecording] = useState(false);
 const [seconds, setSeconds] = useState(0);
 const [audioUrl, setAudioUrl] = useState("");
 const recorder = useRef<MediaRecorder | null>(null);
 const stream = useRef<MediaStream | null>(null);
 const chunks = useRef<Blob[]>([]);
 const mounted = useRef(true);
 const acquiring = useRef(false);
 const [requesting, setRequesting] = useState(false);

 useEffect(() => { if (!recording) return; const timer = setInterval(() => setSeconds(value => value + 1), 1000); return () => clearInterval(timer); }, [recording]);
 useEffect(() => {
  if (!recording) return;
  const timer = setTimeout(() => { if (recorder.current?.state === "recording") recorder.current.stop(); setRecording(false); onRecordingChange?.(false); }, L.audioSeconds * 1000);
  return () => clearTimeout(timer);
 }, [recording, onRecordingChange]);
 useEffect(() => {
  if (!audioFile) { setAudioUrl(""); return; }
  const url = URL.createObjectURL(audioFile);
  setAudioUrl(url);
  return () => URL.revokeObjectURL(url);
 }, [audioFile]);
 useEffect(() => { mounted.current = true; return () => {
  mounted.current = false;
  if (recorder.current?.state === "recording") recorder.current.stop();
  stream.current?.getTracks().forEach(track => track.stop());
 }; }, []);

 async function startRecording() {
  if (acquiring.current || recorder.current?.state === "recording") return;
  onError("");
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
   onError("Audio recording isn’t supported in this browser. Type your explanation instead.");
   return;
  }
  try {
   acquiring.current = true; setRequesting(true); onRecordingChange?.(true);
   const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
   if (!mounted.current) { microphone.getTracks().forEach(track => track.stop()); return; }
   stream.current = microphone;
   const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
   const mediaRecorder = new MediaRecorder(microphone, preferredType ? { mimeType: preferredType } : undefined);
   recorder.current = mediaRecorder;
   chunks.current = [];
   setSeconds(0);
   onAudioFile(null);
   let byteCount = 0;
   mediaRecorder.addEventListener("dataavailable", event => {
    if (event.data.size) { chunks.current.push(event.data); byteCount += event.data.size; }
    if (byteCount > L.audioBytes && mediaRecorder.state === "recording") { mediaRecorder.stop(); setRecording(false); onRecordingChange?.(false); }
   });
   mediaRecorder.addEventListener("stop", () => {
    const mimeType = mediaRecorder.mimeType || "audio/webm";
    const extension = mimeType.includes("mp4") ? "m4a" : "webm";
    const blob = new Blob(chunks.current, { type: mimeType });
    if (mounted.current) {
     setRecording(false); onRecordingChange?.(false);
     if (blob.size > L.audioBytes) onError("Recording exceeds 3,000,000 bytes. Record a shorter explanation or type instead.");
     else if (blob.size) onAudioFile(new File([blob], `explanation-recording.${extension}`, { type: mimeType }));
     else onError("No audio was captured. Check your microphone and try again.");
    }
    microphone.getTracks().forEach(track => track.stop());
    stream.current = null;
   });
   mediaRecorder.addEventListener("error", () => {
    microphone.getTracks().forEach(track => track.stop());
    if (mounted.current) { setRecording(false); onRecordingChange?.(false); onError("Recording failed. Your text has been kept; record again or use text."); }
   });
   mediaRecorder.start(1000);
   setRecording(true);
  } catch (recordingError) {
   onRecordingChange?.(false);
   stream.current?.getTracks().forEach(track => track.stop());
   stream.current = null;
   const name = recordingError instanceof DOMException ? recordingError.name : "";
   if (name === "NotAllowedError" || name === "SecurityError") onError("Microphone access was denied. Allow access or type your explanation instead.");
   else if (name === "NotFoundError") onError("No microphone was found. Connect one or type your explanation instead.");
   else onError("We couldn’t start the microphone. Type your explanation or try again.");
  } finally { acquiring.current = false; if (mounted.current) setRequesting(false); }
 }

 function stopRecording() {
  if (recorder.current?.state === "recording") recorder.current.stop();
  setRecording(false);
  onRecordingChange?.(false);
 }

 function deleteRecording() {
  onAudioFile(null);
  setSeconds(0);
  onError("");
 }

 return <div className={`real-recorder ${recording ? "recording" : ""}`}><span className="microphone"><Mic size={28} /></span><p className="recording-status" role="status">{recording ? "Recording from your microphone" : audioFile ? "Recording ready" : "Ready to record"}</p><div className="timer" aria-label="Recording duration">{formatTime(seconds)}</div>{audioUrl && <audio className="audio-preview" controls src={audioUrl}>Your browser does not support audio playback.</audio>}<div className="recorder-actions">{!recording && !audioFile && <button className="button primary" disabled={disabled || requesting} onClick={startRecording}><Mic size={16} />Start recording</button>}{recording && <button className="button stop-button" onClick={stopRecording}><Square size={13} />Stop</button>}{audioFile && !recording && <><button className="button primary" disabled={disabled || transcribing} onClick={onTranscribe}>{transcribing ? "Transcribing..." : "Create transcript"}</button><button className="button secondary" disabled={disabled} onClick={deleteRecording}><Trash2 size={15} />Delete</button><button className="button ghost compact" disabled={disabled} onClick={() => { deleteRecording(); void startRecording(); }}><RotateCcw size={15} />Record again</button></>}</div><p id="transcription-availability" className="fine-print">Maximum 120 seconds and 3,000,000 bytes. Review and edit the transcript before evaluating.</p><p className="fine-print">Your browser asks for microphone permission only when you start recording.</p></div>;
}
