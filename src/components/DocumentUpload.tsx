"use client";
import { FileText, Upload, X } from "lucide-react";
import { useRef } from "react";

const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx", "gdoc"];
export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;

interface Props {
 id: string;
 label: string;
 prompt: string;
 file: File | null;
 onChange: (file: File | null) => void;
 onError: (message: string) => void;
 disabled?: boolean;
}

export function DocumentUpload({ id, label, prompt, file, onChange, onError, disabled = false }: Props) {
 const input = useRef<HTMLInputElement>(null);
 function selectFile(selected: File | undefined) {
  if (!selected) return;
  const extension = selected.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
   onError("Choose a PDF, Word (.doc or .docx), or Google Docs (.gdoc) file.");
   if (input.current) input.current.value = "";
   return;
  }
  if (selected.size > MAX_DOCUMENT_FILE_SIZE) {
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
 return <div className="document-upload"><div className="transcript-heading"><label htmlFor={id}>{label}</label><span className="small-label">PDF · WORD · GOOGLE DOCS</span></div><label className={`file-drop ${disabled ? "disabled" : ""}`} htmlFor={id}><Upload size={24} /><strong>{prompt}</strong><span>PDF, Word (.doc, .docx), or Google Docs (.gdoc)</span><small>Maximum file size: 10 MB</small></label><input ref={input} className="visually-hidden" id={id} type="file" accept=".pdf,.doc,.docx,.gdoc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={disabled} onChange={event => selectFile(event.target.files?.[0])} />{file && <div className="selected-file" aria-live="polite"><FileText size={20} /><div><strong>{file.name}</strong><span>{fileSize}</span></div><button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={removeFile}><X size={17} /></button></div>}<p className="fine-print file-note">Google Docs files are accepted as `.gdoc`. You can also download a Google Doc as PDF or Word before uploading.</p></div>;
}
