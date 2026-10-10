"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { transcribeAudio } from "@/lib/transcription";

interface Props {
 audioFile: File | null;
 onAudioFile: (file: File | null) => void;
 onTranscript: (transcript: string) => void;
 onError: (message: string) => void;
 disabled?: boolean;
}

function formatTime(seconds: number) {
 return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AudioRecorder({ audioFile, onAudioFile, onTranscript, onError, disabled = false }: Props) {
 const [recording, setRecording] = useState(false);
 const [transcribing, setTranscribing] = useState(false);
 const [seconds, setSeconds] = useState(0);
 const [audioUrl, setAudioUrl] = useState("");
 const recorder = useRef<MediaRecorder | null>(null);
 const stream = useRef<MediaStream | null>(null);
 const chunks = useRef<Blob[]>([]);
 const transcriptionController = useRef<AbortController | null>(null);

 useEffect(() => { if (!recording) return; const timer = setInterval(() => setSeconds(value => value + 1), 1000); return () => clearInterval(timer); }, [recording]);
 useEffect(() => {
  if (!audioFile) { setAudioUrl(""); return; }
  const url = URL.createObjectURL(audioFile);
  setAudioUrl(url);
  return () => URL.revokeObjectURL(url);
 }, [audioFile]);
 useEffect(() => () => {
  transcriptionController.current?.abort();
  if (recorder.current?.state === "recording") recorder.current.stop();
  stream.current?.getTracks().forEach(track => track.stop());
 }, []);

 async function startRecording() {
  onError("");
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
   onError("Audio recording isn’t supported in this browser. Type your explanation instead.");
   return;
  }
  try {
   const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
   stream.current = microphone;
   const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
   const mediaRecorder = new MediaRecorder(microphone, preferredType ? { mimeType: preferredType } : undefined);
   recorder.current = mediaRecorder;
   chunks.current = [];
   setSeconds(0);
   onAudioFile(null);
   mediaRecorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.current.push(event.data); });
   mediaRecorder.addEventListener("stop", () => {
    const mimeType = mediaRecorder.mimeType || "audio/webm";
    const extension = mimeType.includes("mp4") ? "m4a" : "webm";
    const blob = new Blob(chunks.current, { type: mimeType });
    if (blob.size) onAudioFile(new File([blob], `explanation-recording.${extension}`, { type: mimeType }));
    else onError("No audio was captured. Check your microphone and try again.");
    microphone.getTracks().forEach(track => track.stop());
    stream.current = null;
   });
   mediaRecorder.start();
   setRecording(true);
  } catch (recordingError) {
   stream.current?.getTracks().forEach(track => track.stop());
   stream.current = null;
   const name = recordingError instanceof DOMException ? recordingError.name : "";
   if (name === "NotAllowedError" || name === "SecurityError") onError("Microphone access was denied. Allow access or type your explanation instead.");
   else if (name === "NotFoundError") onError("No microphone was found. Connect one or type your explanation instead.");
   else onError("We couldn’t start the microphone. Type your explanation or try again.");
  }
 }

 function stopRecording() {
  if (recorder.current?.state === "recording") recorder.current.stop();
  setRecording(false);
 }

 function deleteRecording() {
  onAudioFile(null);
  setSeconds(0);
  onError("");
 }

 async function transcribe() {
  if (!audioFile || transcribing) return;
  setTranscribing(true);
  onError("");
  transcriptionController.current = new AbortController();
  try {
   const result = await transcribeAudio(audioFile, transcriptionController.current.signal);
   onTranscript(result.transcript);
  } catch (transcriptionError) {
   if (transcriptionError instanceof DOMException && transcriptionError.name === "AbortError") return;
   onError(transcriptionError instanceof Error ? transcriptionError.message : "We couldn’t transcribe this recording. Type your explanation or try again.");
  } finally {
   setTranscribing(false);
   transcriptionController.current = null;
  }
 }

 return <div className={`real-recorder ${recording ? "recording" : ""}`}><span className="microphone"><Mic size={28} /></span><p className="recording-status" role="status">{recording ? "Recording from your microphone" : audioFile ? "Recording ready" : "Ready to record"}</p><div className="timer" aria-label="Recording duration">{formatTime(seconds)}</div>{audioUrl && <audio className="audio-preview" controls src={audioUrl}>Your browser does not support audio playback.</audio>}<div className="recorder-actions">{!recording && !audioFile && <button className="button primary" disabled={disabled || transcribing} onClick={startRecording}><Mic size={16} />Start recording</button>}{recording && <button className="button stop-button" onClick={stopRecording}><Square size={13} />Stop</button>}{audioFile && !recording && <><button className="button primary" disabled={disabled || transcribing} onClick={transcribe}>{transcribing ? <><LoaderCircle className="spin" size={16} />Transcribing…</> : <>Create transcript</>}</button><button className="button secondary" disabled={disabled || transcribing} onClick={deleteRecording}><Trash2 size={15} />Delete</button><button className="button ghost compact" disabled={disabled || transcribing} onClick={() => { deleteRecording(); void startRecording(); }}><RotateCcw size={15} />Record again</button></>}</div><p className="fine-print">Your browser asks for microphone permission only when you start recording.</p></div>;
}
