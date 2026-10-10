"use client";
import { useRef, useState, useEffect } from "react";
import { AudioLines, ShieldCheck } from "lucide-react";
import type { Step } from "@/types/lesson";
import type { ImportedSource } from "@/backend/contracts/domain";
import { sampleSource, sampleTitle } from "@/fixtures/photosynthesis";
import { importLearningSource } from "@/lib/source-ingestion";
import { StepIndicator } from "./StepIndicator";
import { SourceInput } from "./SourceInput";
import { RecorderPreview } from "./RecorderPreview";
import { UnderstandingMap } from "./UnderstandingMap";

export function AppShell() {
 const [step, setStep] = useState<Step>(1);
 const [title, setTitle] = useState("");
 const [source, setSource] = useState("");
 const [sourceFile, setSourceFile] = useState<File | null>(null);
 const [, setImportedSource] = useState<ImportedSource | null>(null);
 const [explanationText, setExplanationText] = useState("");
 const [explanationFile, setExplanationFile] = useState<File | null>(null);
 const [audioFile, setAudioFile] = useState<File | null>(null);
 const main = useRef<HTMLElement>(null);
 const previousStep = useRef(step);

 useEffect(() => { if (previousStep.current !== step) { main.current?.focus(); previousStep.current = step; } }, [step]);

 function reset() { setTitle(""); setSource(""); setSourceFile(null); setImportedSource(null); setExplanationText(""); setExplanationFile(null); setAudioFile(null); setStep(1); }
 async function continueWithSource(signal: AbortSignal) { const imported = await importLearningSource({ title, text: source, file: sourceFile }, signal); setImportedSource(imported); setStep(2); }
 function changeTitle(value: string) { setTitle(value); setImportedSource(null); }
 function changeSource(value: string) { setSource(value); setImportedSource(null); if (value.trim()) setSourceFile(null); }
 function changeSourceFile(file: File | null) { setSourceFile(file); setImportedSource(null); if (file) setSource(""); }
 function loadSample() { setTitle(sampleTitle); setSource(sampleSource); setSourceFile(null); setImportedSource(null); }

 return <><header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-icon"><AudioLines size={24} /></span><div><span className="brand-name">ExplainBack<span className="brand-dot">.</span></span><p>Understand by explaining.</p></div></div><span className="demo-badge"><span />UI prototype · Demo data</span></div></header><main ref={main} tabIndex={-1} className="workspace"><StepIndicator step={step} />{step === 1 && <SourceInput title={title} source={source} sourceFile={sourceFile} onTitle={changeTitle} onSource={changeSource} onSourceFile={changeSourceFile} onSample={loadSample} onContinue={continueWithSource} />}{step === 2 && <RecorderPreview title={title} source={source} sourceFile={sourceFile} explanationText={explanationText} explanationFile={explanationFile} audioFile={audioFile} onExplanationText={setExplanationText} onExplanationFile={setExplanationFile} onAudioFile={setAudioFile} onBack={() => setStep(1)} onResults={() => setStep(3)} />}{step === 3 && <UnderstandingMap onReset={reset} />}<footer className="workspace-footer"><span><ShieldCheck size={14} />Local session. No account needed.</span><span>Small steps. Deeper understanding.</span></footer></main></>;
}
