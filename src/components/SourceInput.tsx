"use client";
import { useState } from "react";
import { AlertCircle, ArrowRight, BookOpen, LoaderCircle, Sparkles } from "lucide-react";
import { DocumentUpload } from "./DocumentUpload";

interface Props {
 title: string; source: string; sourceFile: File | null;
 onTitle: (value: string) => void; onSource: (value: string) => void;
 onSourceFile: (file: File | null) => void; onSample: () => void;
 onContinue: (signal: AbortSignal) => Promise<void>;
}

export function SourceInput({ title, source, sourceFile, onTitle, onSource, onSourceFile, onSample, onContinue }: Props) {
 const [fileError, setFileError] = useState("");
 const [requestError, setRequestError] = useState("");
 const [loading, setLoading] = useState(false);

 async function continueWithSource() {
  if ((!source.trim() && !sourceFile) || loading) return;
  setRequestError(""); setLoading(true);
  const controller = new AbortController();
  try { await onContinue(controller.signal); }
  catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setRequestError(error instanceof Error ? error.message : "We couldn’t import this learning source. Please try again."); }
  finally { setLoading(false); }
 }

 return <section aria-labelledby="source-heading"><div className="view-heading"><span className="eyebrow">STEP 01 · SET THE CONTEXT</span><h1 id="source-heading">What are you learning?</h1><p>Paste your material or upload a PDF or DOCX file.</p></div><div className="source-layout"><div className="card source-card"><div className="card-heading"><div><BookOpen size={19} /><h2>Your learning source</h2></div><span className="small-label">TEXT OR FILE</span></div><label htmlFor="lesson-title">Lesson title <span className="optional">optional</span></label><input id="lesson-title" disabled={loading} maxLength={200} placeholder="e.g. How photosynthesis works" value={title} onChange={event => { onTitle(event.target.value); setRequestError(""); }} /><label htmlFor="learning-material">Paste your learning material</label><textarea id="learning-material" disabled={loading} maxLength={100_000} rows={7} placeholder="Add the material you’re learning from. A short lesson or a few paragraphs is a great place to start…" value={source} onChange={event => { onSource(event.target.value); setRequestError(""); }} /><div className="source-meta"><span>{source.trim() ? source.trim().split(/\s+/).length : 0} words</span><span>{source.length.toLocaleString()} / 100,000 characters</span></div><div className="input-divider"><span>OR</span></div><DocumentUpload id="learning-source-file" label="Upload learning material" prompt="Choose a learning source file" file={sourceFile} onChange={file => { onSourceFile(file); setRequestError(""); }} onError={setFileError} disabled={loading} acceptedExtensions={["pdf", "docx"]} accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" formatLabel="PDF · DOCX" formatDescription="PDF or Word (.docx)" fileTypeError="Choose a PDF or Word (.docx) file." maxFileSize={3_000_000} maxFileSizeLabel="3 MB" note="PDF files need a readable text layer. Scanned PDFs are not supported yet." />{(fileError || requestError) && <div className="request-message error-message" role="alert"><AlertCircle size={17} /><span>{fileError || requestError} Your current input has been kept.</span></div>}<div className="card-bottom"><span className="fine-print">Choose text or one supported file.</span><button className="button primary" disabled={(!source.trim() && !sourceFile) || loading} onClick={continueWithSource}>{loading ? <><LoaderCircle className="spin" size={17} />Importing…</> : <>Continue<ArrowRight size={17} /></>}</button></div></div><aside className="sample-card"><span className="icon-tile"><Sparkles size={22} /></span><span className="eyebrow">A LITTLE INSPIRATION</span><h2>Try it with a sample.</h2><p>Explore how plants turn sunlight into energy with a short photosynthesis lesson.</p><div className="sample-preview"><span>01 / SAMPLE LESSON</span><h3>How photosynthesis works</h3><p>Sunlight, a little chemistry, and the energy behind plant life.</p><span className="sample-tag">Biology · 1 min read</span></div><button className="button secondary" disabled={loading} onClick={() => { onSample(); setRequestError(""); setFileError(""); }}><BookOpen size={16} />Load sample lesson</button><p className="fine-print">Your source is imported when you select Continue. It stays in this session.</p></aside></div></section>;
}
