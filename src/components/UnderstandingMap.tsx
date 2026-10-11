"use client";
import { useEffect, useRef, useState } from "react";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import { GitBranch, BookOpen, ArrowLeft, ArrowRight, Info } from "lucide-react";
import type { EvaluationResult, ImportedSource, SourceAnalysis } from "@/backend/contracts/domain";
import { toReferenceFlow } from "@/lib/reference-graph";
import { ReferenceEdge } from "./ReferenceEdge";
import { SourceEvidenceDetails } from "./SourceEvidenceDetails";
import { ExplanationFeedback } from "./ExplanationFeedback";
import { StatusBadge } from "./StatusBadge";
import { toEvaluatedFlow } from "@/lib/evaluated-graph";

const edgeTypes = { reference: ReferenceEdge };
interface Props {
  analysis: SourceAnalysis; importedSource: ImportedSource; topicId: string;
  onTopic: (id: string) => void; onBack: () => void; onExplain: () => void;
  evaluation?: EvaluationResult;
}

export function UnderstandingMap(props: Props) {
  const { analysis, importedSource, topicId, onTopic, onBack, onExplain, evaluation } = props;
  return <section aria-labelledby="map-heading">
    <div className="view-heading result-heading"><div><span className="eyebrow">STEP 02 · EXPLORE YOUR SOURCE</span><h1 id="map-heading">{evaluation ? "Your explanation feedback" : "See how the ideas connect."}</h1><p>{analysis.document.title || "Your learning source"} · Reference knowledge and topic summaries</p></div></div>
    <div className="notice"><Info size={18} /><p>{evaluation ? "AI feedback grounded in your source and explanation. Missing means not expressed here; uncertain means insufficient evidence. Review the quotes and source for accuracy." : "AI source analysis, not an evaluation of your explanation. Relationships are ungraded. Review the original source for accuracy."}</p></div>
    <div className="analysis-warnings" aria-label="Source warnings">
      {analysis.sourceWarnings?.map((w, i) => <p className="notice" key={`source-${i}`}>{w.code}{w.page !== undefined ? ` · Page ${w.page}` : ""}: {w.message}</p>)}
      {analysis.analysisWarnings?.map((w, i) => <p className="notice" key={`analysis-${i}`}>{w.code}: {w.message}{w.blockId && ` · Source block ${importedSource.document.blocks.findIndex(b => b.id === w.blockId) + 1}`}</p>)}
    </div>
    <div className="topic-picker"><label htmlFor="source-topic">Topic</label><select id="source-topic" value={topicId} onChange={e => onTopic(e.target.value)}>{analysis.graph.topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
    <TopicAnalysis key={`${analysis.id}:${topicId}:${evaluation?.id ?? "source"}`} analysis={analysis} importedSource={importedSource} topicId={topicId} evaluation={evaluation} />
    <div className="card-bottom"><button className="button ghost" onClick={onBack}><ArrowLeft size={16} />{evaluation ? "Back to analysis" : "Back to source"}</button><button className="button primary" onClick={onExplain}>{evaluation ? "Edit and try again" : "Write your explanation"}<ArrowRight size={17} /></button></div>
  </section>;
}

function TopicAnalysis({ analysis, importedSource, topicId, evaluation }: Pick<Props, "analysis" | "importedSource" | "topicId" | "evaluation">) {
  const statements = analysis.graph.statements.filter(s => s.topicId === topicId);
  const complex = statements.filter(s => s.representation.kind === "complex");
  const [selected, setSelected] = useState(statements[0]?.id ?? "");
  const [graphWidth, setGraphWidth] = useState(0);
  const graphContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = graphContainer.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setGraphWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const statement = statements.find(s => s.id === selected);
  const narrowGraph = graphWidth < 420;
  const flow = evaluation ? toEvaluatedFlow(analysis.graph, topicId, evaluation, narrowGraph ? { columns: 1 } : {}) : toReferenceFlow(analysis.graph, topicId, narrowGraph ? { columns: 1 } : {});
  const comparison = statement && evaluation?.comparisons.find(c => c.sourceStatements.some(ref => ref.statementId === statement.id));
  const sections = analysis.lessonSections.filter(s => s.topicId === topicId);
  const selectStatement = (id: string) => setSelected(id);
  return <>
    {sections.map(section => <article className="card lesson-summary" key={section.id} aria-label="Topic summary">
      <div className="card-heading"><div><BookOpen size={19} /><h2>Topic summary</h2></div><span className="small-label">SOURCE KNOWLEDGE</span></div>
      <p className="summary-text">{section.summary}</p>
      <ul className="key-points">{section.keyPoints.map(p => <li key={p.id}><p>{p.text}</p><div className="statement-links">{p.statementIds.map((id, i) => <button key={id} className="button ghost" onClick={() => selectStatement(id)}>View supporting statement {i + 1}</button>)}</div></li>)}</ul>
      <details><summary>Summary supporting statements</summary>{section.statementIds.map(id => <button className="relationship-row" key={id} onClick={() => selectStatement(id)}>{statements.find(s => s.id === id)?.assertion}</button>)}</details>
    </article>)}
    <div className="results-layout"><div className="card map-card">
      <div className="card-heading"><div><GitBranch size={19} /><h2>Reference graph</h2></div><span className="small-label">{statements.length} RELATIONSHIPS</span></div>
      <div ref={graphContainer} className="graph reference-graph" aria-label="Source concept map" data-topic-id={topicId}>{graphWidth > 0 && <ReactFlow key={String(narrowGraph)} nodes={flow.nodes} edges={flow.edges.map(e => ({ ...e, selected: selected === e.id }))} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.3 }} nodesDraggable={false} nodesConnectable={false} onEdgeClick={(_, edge) => selectStatement(edge.id)} minZoom={0.1} maxZoom={2} preventScrolling={false}><Background gap={18} color="#dfe5e3" /><Controls showInteractive={false} /></ReactFlow>}</div>
      <p className="fine-print graph-help">Arrows show binary relationships. Complex statements are preserved in cards below; their participants remain visible as nodes. Select an edge or statement to inspect evidence.</p>
      {complex.map(s => <article className="card lesson-summary" key={s.id} aria-label="Complex statement">
        <div className="card-heading"><h3>Complex statement</h3>{evaluation ? (() => { const c = evaluation.comparisons.find(c => c.referenceRelationshipId === s.id); return c ? <StatusBadge status={c.status} /> : <span>Not evaluated</span>; })() : <span className="neutral-label">Source</span>}</div>
        <p>{s.assertion}</p>
        {s.representation.kind === "complex" && <ul>{s.representation.participants.map((p, i) => <li key={i}>{p.role}: {analysis.graph.concepts.find(c => c.id === p.conceptId)?.name}</li>)}</ul>}
        <button className="button ghost" onClick={() => selectStatement(s.id)}>Inspect statement evidence</button>
      </article>)}
      <div className="relationship-list"><p className="eyebrow">SELECT A SOURCE RELATIONSHIP</p>{statements.map(s => <button key={s.id} data-statement-id={s.id} aria-pressed={selected === s.id} className={`relationship-row ${selected === s.id ? "selected" : ""}`} onClick={() => selectStatement(s.id)}><span>{s.assertion}</span>{evaluation ? (() => { const c = evaluation.comparisons.find(c => c.sourceStatements.some(ref => ref.statementId === s.id)); return c ? <StatusBadge status={c.status} /> : <span className="neutral-label">Not evaluated</span>; })() : <span className="neutral-label">Source</span>}</button>)}</div>
    </div>{statement && <div>{evaluation && comparison && <ExplanationFeedback evaluation={evaluation} comparison={comparison} />}<SourceEvidenceDetails analysis={analysis} importedSource={importedSource} statement={statement} evaluated={!!evaluation} /></div>}</div>
    {evaluation && evaluation.additionalIdeas.filter(i => i.topicId === topicId || (!i.topicId && topicId === analysis.graph.topics[0].id)).map(idea => <article className="card lesson-summary" key={idea.id} aria-label="Additional idea"><h2>Additional idea outside the source</h2><p>{idea.explanation}</p>{idea.learnerStatements.map(ref => <div key={ref.statementId}>{evaluation.learnerGraph.statements.find(s => s.id === ref.statementId)?.evidenceIds.map(id => <blockquote className="source-quote" key={id}>{evaluation.learnerGraph.evidence.find(e => e.id === id)?.quote}</blockquote>)}</div>)}<p className="fine-print">This is not automatically a correctness verdict.</p></article>)}
  </>;
}
