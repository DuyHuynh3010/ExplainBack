"use client";
import { FileText, Upload, X } from "lucide-react";
import { useRef } from "react";

const DEFAULT_ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx", "gdoc"];
export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;

interface Props {
 id: string;
 label: string;
 prompt: string;
 file: File | null;
 onChange: (file: File | null) => void;
 onError: (message: string) => void;
 disabled?: boolean;
 acceptedExtensions?: string[];
 accept?: string;
 formatLabel?: string;
 formatDescription?: string;
 fileTypeError?: string;
 maxFileSize?: number;
 maxFileSizeLabel?: string;
 note?: string;
}

export function DocumentUpload({ id, label, prompt, file, onChange, onError, disabled = false, acceptedExtensions = DEFAULT_ACCEPTED_EXTENSIONS, accept = ".pdf,.doc,.docx,.gdoc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", formatLabel = "PDF · WORD · GOOGLE DOCS", formatDescription = "PDF, Word (.doc, .docx), or Google Docs (.gdoc)", fileTypeError = "Choose a PDF, Word (.doc or .docx), or Google Docs (.gdoc) file.", maxFileSize = MAX_DOCUMENT_FILE_SIZE, maxFileSizeLabel = "10 MB", note = "Google Docs files are accepted as `.gdoc`. You can also download a Google Doc as PDF or Word before uploading." }: Props) {
 const input = useRef<HTMLInputElement>(null);
 function selectFile(selected: File | undefined) {
  if (!selected) return;
  const extension = selected.name.split(".").pop()?.toLowerCase() ?? "";
  if (!acceptedExtensions.includes(extension)) {
   onError(fileTypeError);
   if (input.current) input.current.value = "";
   return;
  }
  if (selected.size > maxFileSize) {
   onError(`The file must be ${maxFileSizeLabel} or smaller.`);
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
 return <div className="document-upload"><div className="transcript-heading"><label htmlFor={id}>{label}</label><span className="small-label">{formatLabel}</span></div><label className={`file-drop ${disabled ? "disabled" : ""}`} htmlFor={id}><Upload size={24} /><strong>{prompt}</strong><span>{formatDescription}</span><small>Maximum file size: {maxFileSizeLabel}</small></label><input ref={input} className="visually-hidden" id={id} type="file" accept={accept} disabled={disabled} onChange={event => selectFile(event.target.files?.[0])} />{file && <div className="selected-file" aria-live="polite"><FileText size={20} /><div><strong>{file.name}</strong><span>{fileSize}</span></div><button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={removeFile}><X size={17} /></button></div>}{note && <p className="fine-print file-note">{note}</p>}</div>;
}
