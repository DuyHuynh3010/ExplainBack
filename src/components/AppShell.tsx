"use client";
import { useRef, useState, useEffect } from "react";
import { AudioLines, ShieldCheck } from "lucide-react";
import type { Step } from "@/types/lesson";
import { sampleSource, sampleTitle } from "@/fixtures/photosynthesis";
import { StepIndicator } from "./StepIndicator";
import { SourceInput } from "./SourceInput";
import { RecorderPreview } from "./RecorderPreview";
import { UnderstandingMap } from "./UnderstandingMap";
export function AppShell() {
 const [step, setStep] = useState<Step>(1);
 const [title, setTitle] = useState("");
 const [source, setSource] = useState("");
 const [transcript, setTranscript] = useState("");
 const main = useRef<HTMLElement>(null);
 const previousStep = useRef(step);
 useEffect(() => { if (previousStep.current !== step) { main.current?.focus(); previousStep.current = step; } }, [step]);
 function reset() { setTitle(""); setSource(""); setTranscript(""); setStep(1); }
 return <><header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-icon"><AudioLines size={24} /></span><div><span className="brand-name">ExplainBack<span className="brand-dot">.</span></span><p>Understand by explaining.</p></div></div><span className="demo-badge"><span />UI prototype · Demo data</span></div></header><main ref={main} tabIndex={-1} className="workspace"><StepIndicator step={step} />{step === 1 && <SourceInput title={title} source={source} onTitle={setTitle} onSource={setSource} onSample={() => { setTitle(sampleTitle); setSource(sampleSource); }} onContinue={() => { if (source.trim()) setStep(2); }} />}{step === 2 && <RecorderPreview title={title} source={source} transcript={transcript} onTranscript={setTranscript} onBack={() => setStep(1)} onResults={() => setStep(3)} />}{step === 3 && <UnderstandingMap onReset={reset} />}<footer className="workspace-footer"><span><ShieldCheck size={14} />Local session. No account needed.</span><span>Small steps. Deeper understanding.</span></footer></main></>;
}
