"use client";
import { useState } from "react";
import { AlertCircle, ArrowRight, BookOpen, LoaderCircle } from "lucide-react";
import type { ImportedSource } from "@/backend/contracts/domain";
import { SOURCE_LIMITS } from "@/backend/contracts/source-limits";
import { ANALYSIS_LIMITS } from "@/backend/analysis/limits";
import { SECTION_LIMITS } from "@/backend/analysis/sections";
import type { SourcePhase } from "@/lib/use-source-analysis";
import { DocumentUpload } from "./DocumentUpload";
import type { AnalysisProgress } from "@/lib/source-analysis";

interface Props {
  title: string; source: string; sourceFile: File | null;
  onTitle: (value: string) => void; onSource: (value: string) => void;
  onSourceFile: (file: File | null) => void;
  onContinue: () => Promise<void>; onCancel: () => void;
  phase: SourcePhase; requestError: string; importedSource: ImportedSource | null;
  progress?: AnalysisProgress | null;
}

export function SourceInput({ title, source, sourceFile, onTitle, onSource, onSourceFile, onContinue, onCancel, phase, requestError, importedSource, progress }: Props) {
  const [fileError, setFileError] = useState("");
  const loading = phase !== "idle";
  return <section aria-label="Learning source">
    <div className="source-layout"><div className="card source-card" aria-busy={loading}>
      <div className="card-heading"><div><BookOpen size={19} /><h2>Your learning source</h2></div><span className="small-label">TEXT OR FILE</span></div>
      <label htmlFor="lesson-title">Lesson title <span className="optional">optional</span></label>
      <input id="lesson-title" maxLength={SOURCE_LIMITS.titleCharacters} placeholder="e.g. How photosynthesis works" value={title} onChange={event => onTitle(event.target.value)} />
      <label htmlFor="learning-material">Paste your learning material</label>
      <textarea id="learning-material" maxLength={SOURCE_LIMITS.textCharacters} rows={7} placeholder="Add the material you’re learning from. A short lesson or a few paragraphs is a great place to start…" value={source} onChange={event => { onSource(event.target.value); setFileError(""); }} />
      <div className="source-meta"><span>{source.trim() ? source.trim().split(/\s+/).length : 0} words</span><span>{source.length.toLocaleString()} / {SOURCE_LIMITS.textCharacters.toLocaleString()} characters</span></div>
      <p className="fine-print">Analysis supports up to {ANALYSIS_LIMITS.sourceCharacters.toLocaleString()} UTF-16 characters and {ANALYSIS_LIMITS.blocks} blocks. Larger sources are rejected without truncation.</p>
      <p className="fine-print">Section headings organize topics. Up to {SECTION_LIMITS.parts} processing parts and {SECTION_LIMITS.generations} AI generations, including repairs, per attempt. Completed parts remain in this local session for retry.</p>
      <div className="input-divider"><span>OR</span></div>
      <DocumentUpload id="learning-source-file" label="Upload learning material" prompt="Choose a learning source file" file={sourceFile} onChange={onSourceFile} onError={setFileError} acceptedExtensions={["pdf", "docx"]} accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" formatLabel="PDF · DOCX" formatDescription="PDF or Word (.docx)" fileTypeError="Choose a PDF or Word (.docx) file." maxFileSize={SOURCE_LIMITS.fileBytes} maxFileSizeLabel="3,000,000 bytes" note="PDF files need a readable text layer. Scanned PDFs are not supported yet." />
      {(fileError || requestError) && <div className="request-message error-message" role="alert"><AlertCircle size={17} /><span>{fileError || requestError} Your current input has been kept.</span></div>}
      {importedSource && <div className="notice import-notice" role="status"><BookOpen size={17} /><p>Source imported · {importedSource.document.blocks.length} blocks. {requestError ? "Retry reuses this imported source." : "Ready for analysis."}</p></div>}
      {importedSource?.warnings.map((warning, i) => <p className="notice" key={i}>{warning.code}{warning.page !== undefined ? ` · Page ${warning.page}` : ""}: {warning.message}</p>)}
      {loading && <p className="fine-print" role="status">{phase === "importing" ? "Importing your learning source…" : progress ? `Analyzing part ${progress.completed + 1} of ${progress.total}: ${progress.title}. ${progress.completed} parts completed.` : "Analyzing your source with AI…"} Editing the source cancels this request.</p>}
      {!!requestError && !!progress?.completed && <p className="fine-print">Completed parts are kept in this session. Retry continues the unfinished part within the remaining call budget.</p>}
      <div className="card-bottom"><span className="fine-print">Choose text or one supported file.</span><div className="inline-actions">
        {loading && <button className="button secondary" onClick={onCancel}>Cancel processing</button>}
        <button className="button primary" disabled={(!source.trim() && !sourceFile) || loading} onClick={() => void onContinue()}>{loading ? <><LoaderCircle className="spin" size={17} />{phase === "importing" ? "Importing…" : "Analyzing…"}</> : <>{requestError ? "Retry" : "Continue"}<ArrowRight size={17} /></>}</button>
      </div></div>
    </div></div>
  </section>;
}
