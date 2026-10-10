"use client";
import { FileText, Upload, X } from "lucide-react";
import { useRef } from "react";

const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx", "gdoc"];
export const MAX_EXPLANATION_FILE_SIZE = 10 * 1024 * 1024;

export function isAcceptedExplanationFile(file: File) {
 return ACCEPTED_EXTENSIONS.includes(file.name.split(".").pop()?.toLowerCase() ?? "") && file.size <= MAX_EXPLANATION_FILE_SIZE;
}

export function TranscriptEditor({ file, onChange, onError, disabled = false }: { file: File | null; onChange: (file: File | null) => void; onError: (message: string) => void; disabled?: boolean }) {
 const input = useRef<HTMLInputElement>(null);
 function selectFile(selected: File | undefined) {
  if (!selected) return;
  const extension = selected.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
   onError("Choose a PDF, Word (.doc or .docx), or Google Docs (.gdoc) file.");
   if (input.current) input.current.value = "";
   return;
  }
  if (selected.size > MAX_EXPLANATION_FILE_SIZE) {
   onError("The file must be 10 MB or smaller.");
   if (input.current) input.current.value = "";
   return;
  }
  onError("");
  onChange(selected);
 }
 function removeFile() {
  onChange(null);
  onError("");
  if (input.current) input.current.value = "";
 }
 const fileSize = file ? file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "";
 return <div className="transcript-editor"><div className="transcript-heading"><label htmlFor="explanation-file">Upload your explanation</label><span className="small-label">PDF · WORD · GOOGLE DOCS</span></div><label className={`file-drop ${disabled ? "disabled" : ""}`} htmlFor="explanation-file"><Upload size={24} /><strong>Choose an explanation file</strong><span>PDF, Word (.doc, .docx), or Google Docs (.gdoc)</span><small>Maximum file size: 10 MB</small></label><input ref={input} className="visually-hidden" id="explanation-file" type="file" accept=".pdf,.doc,.docx,.gdoc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={disabled} onChange={event => selectFile(event.target.files?.[0])} />{file && <div className="selected-file" aria-live="polite"><FileText size={20} /><div><strong>{file.name}</strong><span>{fileSize}</span></div><button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={removeFile}><X size={17} /></button></div>}<p className="fine-print file-note">Google Docs files are accepted as `.gdoc`. You can also download a Google Doc as PDF or Word before uploading.</p></div>;
}
