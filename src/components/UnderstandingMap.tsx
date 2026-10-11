"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, BookOpen, ArrowLeft, ArrowRight, Info, Expand, X, PanelRight } from "lucide-react";
import type { EvaluationResult, ImportedSource, SourceAnalysis } from "@/backend/contracts/domain";
import type { GraphSelection } from "@/lib/reference-graph";
import { ReferenceCanvas } from "./ReferenceCanvas";
import { SourceEvidenceDetails } from "./SourceEvidenceDetails";
import { StatusBadge } from "./StatusBadge";
import { ALL_TOPICS, ADDITIONAL_IDEAS, toLessonFlow, toComparisonFlow, toExplanationFlow, type ExplorerFlow, type GraphView } from "@/lib/comparison-graph";
import { ExplanationGraphView } from "./ExplanationGraphView";
import { useGraphFullscreen } from "@/lib/use-graph-fullscreen";

interface Props {
  analysis: SourceAnalysis; importedSource: ImportedSource; topicId: string;
  onTopic: (id: string) => void; onBack: () => void; onExplain: () => void;
  evaluation?: EvaluationResult; view?: GraphView; onView?: (view: GraphView) => void;
}
export function UnderstandingMap({ analysis, importedSource, topicId, onTopic, onBack, onExplain, evaluation, view = "lesson", onView }: Props) {
  const explorer = useRef<HTMLDivElement>(null), expandButton = useRef<HTMLButtonElement>(null);
  const { expanded, mode, pending, error: fullscreenError, enter, exit } = useGraphFullscreen(explorer);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [choices, setChoices] = useState<Record<string, { id: string; selection: GraphSelection }>>({});
  const key = `${view}:${topicId}`;
  const flow = useMemo<ExplorerFlow>(() => {
    if (evaluation && view === "compare") return toComparisonFlow(analysis.graph, evaluation, topicId);
    if (evaluation && view === "explanation") return toExplanationFlow(evaluation, topicId);
    return toLessonFlow(analysis.graph, topicId);
  }, [analysis.graph, evaluation, topicId, view]);
  const cachedChoice = choices[key] ?? { id: flow.details[0]?.id ?? "", selection: null };
  // A cached Lesson selection must still belong to the current source/scope.
  const choice = view !== "lesson" ? cachedChoice : {
    id: flow.details.some(d => d.id === cachedChoice.id) ? cachedChoice.id : flow.details[0]?.id ?? "",
    selection: cachedChoice.selection && (cachedChoice.selection.kind === "node"
      ? flow.nodes.some(n => n.id === cachedChoice.selection?.id)
      : flow.details.some(d => d.id === cachedChoice.selection?.id)) ? cachedChoice.selection : null,
  };
  const lessonSections = topicId === ALL_TOPICS
    ? analysis.graph.topics.flatMap(t => analysis.lessonSections.filter(s => s.topicId === t.id))
    : analysis.lessonSections.filter(s => s.topicId === topicId);
  const detail = flow.details.find(d => d.id === choice.id);
  const learnerCount = new Set(flow.details.flatMap(d => d.learner.map(s => s.id))).size;
  const selectedConcept = choice.selection?.kind === "node" ? flow.nodes.find(n => n.id === choice.selection?.id) : undefined;
  const select = (selection: GraphSelection) => {
    const linkedDetails = view === "lesson" && selection?.kind === "node"
      ? flow.details.filter(d => flow.edges.some(e => e.data?.referenceStatementId === d.id && (e.source === selection.id || e.target === selection.id))) : [];
    const id = selection?.kind === "statement" ? selection.id
      : linkedDetails.length ? (linkedDetails.some(d => d.id === choice.id) ? choice.id : linkedDetails[0].id) : choice.id;
    setChoices(previous => ({ ...previous, [key]: { id, selection } }));
    if (selection?.kind === "statement" || linkedDetails.length) {
      setDetailsOpen(true);
      if (!expanded) explorer.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    explorer.current?.querySelector<HTMLButtonElement>(".close-graph")?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); void exit(); }
      if (e.key === "Tab") {
        const controls = Array.from(explorer.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,summary,[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); requestAnimationFrame(() => expandButton.current?.focus()); };
  }, [expanded, mode]);

  return <section aria-labelledby="map-heading">
    <div className="view-heading result-heading"><div><span className="eyebrow">{view === "lesson" ? "STEP 02 · EXPLORE YOUR SOURCE" : "STEP 03 · EXPLORE YOUR EXPLANATION"}</span><h1 id="map-heading">{view === "compare" ? "Compare lesson and explanation." : view === "explanation" ? "See what your explanation says." : "See how the ideas connect."}</h1><p>{analysis.document.title || "Your learning source"} · {view === "lesson" ? "Reference knowledge and topic summaries" : "Independent learner graph and evidence"}</p></div></div>
    <div className="notice"><Info size={18} /><p>{view === "compare" ? "Compare the two original claims. Status describes your explanation against the lesson, never a grade of the lesson itself." : view === "explanation" ? "This graph represents your explanation, including mistakes and additional ideas. Compare uses the cached evaluation." : "AI source analysis, not an evaluation of your explanation. Relationships are ungraded. Review the original source for accuracy."}</p></div>
    <div className="analysis-warnings" aria-label="Source warnings">{analysis.sourceWarnings?.map((w, i) => <p className="notice" key={i}>{w.code}{w.page !== undefined ? ` · Page ${w.page}` : ""}: {w.message}</p>)}{!!analysis.analysisWarnings?.length && <details className="review-notes"><summary>Review notes ({analysis.analysisWarnings.length})</summary><p>These notes identify source or extraction details to review. They do not grade your explanation.</p>{analysis.analysisWarnings.map((w, i) => <p key={i}>{w.message}{w.blockId && ` · Source block ${importedSource.document.blocks.findIndex(b => b.id === w.blockId) + 1}`}</p>)}</details>}</div>
    {view === "lesson" && lessonSections.map(section => <article className="card lesson-summary" key={section.id} aria-label={topicId === ALL_TOPICS ? `Topic summary: ${analysis.graph.topics.find(t => t.id === section.topicId)?.title}` : "Topic summary"}><div className="card-heading"><div><BookOpen size={19} /><h2>{topicId === ALL_TOPICS ? analysis.graph.topics.find(t => t.id === section.topicId)?.title : "Topic summary"}</h2></div><span className="small-label">SOURCE KNOWLEDGE</span></div><p className="summary-text">{section.summary}</p><ul className="key-points">{section.keyPoints.map(p => <li key={p.id}><p>{p.text}</p><div className="statement-links">{p.statementIds.map((id, i) => <button key={id} className="button ghost" onClick={() => select({ kind: "statement", id })}>View supporting statement {i + 1}</button>)}</div></li>)}</ul><details><summary>Summary supporting statements</summary>{section.statementIds.map(id => <button className="relationship-row" key={id} onClick={() => select({ kind: "statement", id })}>{analysis.graph.statements.find(s => s.id === id)?.assertion}</button>)}</details></article>)}

    <div ref={explorer} data-graph-workspace data-fullscreen-mode={mode} role={expanded ? "dialog" : undefined} aria-label={expanded ? "Expanded graph explorer" : "Graph workspace"} aria-modal={expanded || undefined} className={`graph-workspace ${expanded ? "graph-expanded" : ""} ${detailsOpen ? "" : "details-collapsed"}`}>
      <div className="graph-explorer-controls">{evaluation && <div className="graph-view-switch" role="group" aria-label="Graph view">{(["lesson", "explanation", "compare"] as const).map(v => <button key={v} className={`button ${view === v ? "primary" : "secondary"}`} aria-pressed={view === v} onClick={() => onView?.(v)}>{v === "lesson" ? "Lesson" : v === "explanation" ? "Explanation" : "Compare"}</button>)}</div>}
        <div className="graph-explorer-toolbar"><div className="topic-picker"><label htmlFor="source-topic">Topic</label><select id="source-topic" value={topicId} onChange={e => onTopic(e.target.value)}><option value={ALL_TOPICS}>All topics</option>{analysis.graph.topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}{view !== "lesson" && <option value={ADDITIONAL_IDEAS}>Additional ideas</option>}</select></div><button className="button secondary" aria-expanded={detailsOpen} aria-controls="graph-details" onClick={() => setDetailsOpen(v => !v)}><PanelRight size={17} />{detailsOpen ? "Hide details" : "Show details"}</button>{expanded ? <button className="button secondary close-graph" onClick={() => void exit()}><X size={17} />{mode === "native" ? "Exit fullscreen" : "Close expanded graph"}</button> : <button ref={expandButton} className="button secondary" disabled={pending} onClick={() => void enter()}><Expand size={17} />{pending ? "Opening fullscreen…" : "Expand graph"}</button>}</div>{fullscreenError && <p role="alert" className="request-message error-message">{fullscreenError}</p>}
      </div>
      <div className="results-layout"><div className="card map-card"><div className="card-heading"><div><GitBranch size={19} /><h2>{view === "compare" ? "Compare graphs" : view === "explanation" ? "Explanation graph" : "Reference graph"}</h2></div><span className="small-label">{view === "compare" ? `${flow.details.filter(d => d.comparison).length} LESSON CLAIMS · ${learnerCount} EXPLANATION CLAIMS` : view === "explanation" ? `${learnerCount} EXPLANATION CLAIMS` : `${flow.details.length} RELATIONSHIPS`}</span></div>
        {flow.nodes.length ? <ReferenceCanvas key={`${analysis.id}:${evaluation?.id ?? ""}:${key}`} flow={flow} topicId={topicId} selection={choice.selection} onSelect={select} focusSelection={view === "compare"} /> : <p className="notice">No explanation claims are aligned with this view. Nothing has been filled in from the lesson.</p>}
        <div className="graph-legend"><span><i className="concept-key" />Concept</span><span><i className="relation-key" />Complex claim</span>{view === "compare" ? <><span className="lesson-line">Lesson reference: dashed</span><span className="explanation-line">Explanation: solid</span><span>Both: matched identical claim</span><span>Status evaluates the explanation</span></> : <><span>→ Binary / agent / input / output</span><span>Role links belong to one complete claim</span></>}</div><p className="graph-instructions">Select a claim to inspect its evidence{view === "compare" ? " and focus its linked counterpart" : ""}. Drag to pan; scroll on canvas to zoom.</p>
      </div><div id="graph-details" className="graph-details" hidden={!detailsOpen}>{selectedConcept?.data.identities && <details className="card" aria-label="Concept identities"><summary>Original concepts</summary>{selectedConcept.data.identities.map(i => <p key={`${i.graphId}:${i.id}`}>{i.origin === "lesson" ? "Lesson" : "Explanation"}: {i.label}<small className="original-concept-label">{i.graphId} / {i.id}</small></p>)}</details>}{detail && (evaluation && view !== "lesson" ? <ExplanationGraphView analysis={analysis} evaluation={evaluation} detail={detail} view={view} /> : detail.lesson[0] && <SourceEvidenceDetails analysis={analysis} importedSource={importedSource} statement={detail.lesson[0]} />)}</div></div>
    </div>

    <div className="card relationship-list"><p className="eyebrow">{view === "compare" ? "SELECT A COMPARISON OR ADDITIONAL IDEA" : view === "lesson" ? "SELECT A SOURCE RELATIONSHIP" : "WHAT YOUR EXPLANATION SAYS"}</p>{flow.details.map(d => <button key={d.id} data-detail-id={view === "lesson" ? undefined : d.id} data-statement-id={d.lesson[0]?.id} aria-pressed={choice.id === d.id} className={`relationship-row ${choice.id === d.id ? "selected" : ""}`} onClick={() => select({ kind: "statement", id: d.id })}><span>{d.lesson[0]?.assertion ?? d.learner[0]?.assertion}</span>{view === "compare" && d.comparison ? <StatusBadge status={d.comparison.status} /> : <span className="neutral-label">{view === "lesson" ? "Source" : view === "compare" ? "Not compared" : "Explanation"}</span>}</button>)}</div>
    <div className="card-bottom"><button className="button ghost" onClick={onBack}><ArrowLeft size={16} />{evaluation ? "Back to analysis" : "Back to source"}</button><button className="button primary" onClick={onExplain}>{evaluation ? "Edit and try again" : "Write your explanation"}<ArrowRight size={17} /></button></div>
  </section>;
}
