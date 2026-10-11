"use client";
import { useRef, useState, useEffect } from "react";
import { AudioLines, ShieldCheck, RotateCcw } from "lucide-react";
import type { Step } from "@/types/lesson";
import { sampleSource, sampleTitle } from "@/fixtures/photosynthesis";
import { useSourceAnalysis } from "@/lib/use-source-analysis";
import { useExplanation } from "@/lib/use-explanation";
import { StepIndicator } from "./StepIndicator";
import { SourceInput } from "./SourceInput";
import { RecorderPreview } from "./RecorderPreview";
import { UnderstandingMap } from "./UnderstandingMap";
import { ALL_TOPICS, ADDITIONAL_IDEAS, type GraphView } from "@/lib/comparison-graph";

export function AppShell() {
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [explanationText, setExplanationText] = useState("");
  const [explanationFile, setExplanationFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [topicId, setTopicId] = useState("");
  const [resetVersion, setResetVersion] = useState(0);
  const [graphView, setGraphView] = useState<GraphView>("explanation");
  const [editingExplanation, setEditingExplanation] = useState(false);
  const session = useSourceAnalysis();
  const explanation = useExplanation();
  const main = useRef<HTMLElement>(null);
  const previousStep = useRef(step);
  useEffect(() => { if (previousStep.current !== step) { main.current?.focus(); previousStep.current = step; } }, [step]);

  function invalidateSource() {
    session.invalidate();
    explanation.invalidate(true);
    setTopicId("");
    setExplanationText(""); setExplanationFile(null); setAudioFile(null);
    setStep(1);
    setGraphView("explanation"); setEditingExplanation(false);
  }
  function reset() { invalidateSource(); setTitle(""); setSource(""); setSourceFile(null); setResetVersion(v => v + 1); }
  async function continueWithSource() {
    if (await session.run({ title, text: source, file: sourceFile })) setStep(2);
  }
  function changeTitle(value: string) { invalidateSource(); setTitle(value); }
  function changeSource(value: string) { invalidateSource(); setSource(value); if (value.trim()) setSourceFile(null); }
  function changeSourceFile(file: File | null) { invalidateSource(); setSourceFile(file); if (file) setSource(""); }
  function loadSample() { invalidateSource(); setTitle(sampleTitle); setSource(sampleSource); setSourceFile(null); }
  function changeExplanationText(text: string) { explanation.invalidate(); setExplanationText(text); setExplanationFile(null); }
  function changeExplanationFile(file: File | null) { explanation.invalidate(); setExplanationFile(file); }
  function changeAudio(file: File | null) { explanation.invalidate(true); setAudioFile(file); }
  async function transcribe() {
    if (!audioFile) return;
    const text = await explanation.transcribe(audioFile);
    if (text !== null) { setExplanationText(text); setExplanationFile(null); }
  }
  async function importExplanationFile() {
    if (!explanationFile) return;
    const text = await explanation.importFile(explanationFile);
    if (text !== null) { setExplanationText(text); setExplanationFile(null); }
  }
  async function evaluate() {
    if (!session.analysis || !session.importedSource || !explanationText.trim() || explanationFile) return;
    if (await explanation.evaluate({ schemaVersion: "2.0", importedSource: session.importedSource, sourceAnalysis: session.analysis, topicIds: session.analysis.graph.topics.map(t => t.id), learner: { text: explanationText } })) {
      setEditingExplanation(false); setGraphView("explanation"); setTopicId(ALL_TOPICS);
    }
  }
  function changeGraphView(view: GraphView) {
    if (view === "lesson" && [ALL_TOPICS, ADDITIONAL_IDEAS].includes(topicId)) setTopicId(session.analysis!.graph.topics[0].id);
    setGraphView(view);
  }
  const lessonTopic = session.analysis?.graph.topics.some(t => t.id === topicId) ? topicId : session.analysis?.graph.topics[0].id ?? "";

  return <>
    <header className="app-header"><div className="header-inner">
      <div className="brand"><span className="brand-icon"><AudioLines size={24} /></span><div><span className="brand-name">ExplainBack<span className="brand-dot">.</span></span><p>Understand by explaining.</p></div></div>
      <span className="demo-badge"><span />Live source analysis</span>
    </div></header>
    <main ref={main} tabIndex={-1} className="workspace">
      <div className="session-toolbar"><StepIndicator step={step} /><button className="button ghost" onClick={reset}><RotateCcw size={15} />Start over</button></div>
      {step === 1 && <SourceInput key={resetVersion} title={title} source={source} sourceFile={sourceFile} onTitle={changeTitle} onSource={changeSource} onSourceFile={changeSourceFile} onSample={loadSample} onContinue={continueWithSource} phase={session.phase} requestError={session.error} importedSource={session.importedSource} progress={session.progress} onCancel={session.cancel} />}
      {step === 2 && session.analysis && session.importedSource && <UnderstandingMap analysis={session.analysis} importedSource={session.importedSource} topicId={lessonTopic} onTopic={setTopicId} onBack={() => setStep(1)} onExplain={() => { setEditingExplanation(!explanation.evaluation); setStep(3); }} />}
      {step === 3 && explanation.evaluation && !editingExplanation && session.analysis && session.importedSource && <UnderstandingMap analysis={session.analysis} importedSource={session.importedSource} topicId={graphView === "lesson" ? lessonTopic : topicId || ALL_TOPICS} onTopic={setTopicId} onBack={() => setStep(2)} onExplain={() => setEditingExplanation(true)} evaluation={explanation.evaluation} view={graphView} onView={changeGraphView} />}
      {step === 3 && (!explanation.evaluation || editingExplanation) && <RecorderPreview title={title} explanationText={explanationText} explanationFile={explanationFile} audioFile={audioFile} onExplanationText={changeExplanationText} onExplanationFile={changeExplanationFile} onAudioFile={changeAudio} onBack={() => { setStep(2); }} onTranscribe={() => void transcribe()} onImportFile={() => void importExplanationFile()} onEvaluate={() => void evaluate()} phase={explanation.phase} requestError={explanation.error} transcription={explanation.transcription} canEvaluate={!!session.analysis && !!session.importedSource && !!explanationText.trim()} />}
      <footer className="workspace-footer"><span><ShieldCheck size={14} />Local session. No account needed.</span><span>Small steps. Deeper understanding.</span></footer>
    </main>
  </>;
}
