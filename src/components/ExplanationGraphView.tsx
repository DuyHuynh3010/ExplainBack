import type { Document, EvaluationResult, KnowledgeGraph, SourceAnalysis, Statement } from "@/backend/contracts/domain";
import type { GraphDetail } from "@/lib/comparison-graph";
import { StatusBadge } from "./StatusBadge";

function ClaimSide({ title, statements, graph, document }: { title: string; statements: Statement[]; graph: KnowledgeGraph; document: Document }) {
  const evidence = [...new Set(statements.flatMap(s => s.evidenceIds))].flatMap(id => {
    const e = graph.evidence.find(e => e.id === id); return e ? [e] : [];
  });
  return <section className="comparison-side"><h3>{title}</h3>
    {statements.map(s => <div className="comparison-claim" key={s.id} data-claim-id={s.id}><p className="claim-assertion">{s.assertion}</p>{s.formula && <p className="formula-text">{s.formula}</p>}{!!s.conditions.length && <p className="claim-context">{s.conditions.join("; ")}</p>}</div>)}
    {!!evidence.length && <details className="comparison-evidence"><summary>{title === "Lesson says" ? "Source" : "Explanation"} quotes & location ({evidence.length})</summary>{evidence.map(e => {
      const location = document.blocks.find(b => b.id === e.blockId)?.location, range = e.location?.charRange;
      return <div key={e.id}><blockquote className="source-quote">{e.quote}</blockquote><p className="fine-print">{e.verification}{location?.page !== undefined && ` · Page ${location.page}`}{location?.paragraph !== undefined && ` · Paragraph ${location.paragraph}`}{range && ` · ${title === "Lesson says" ? "Block" : "Explanation"} UTF-16 [${range.start}, ${range.end})`}</p></div>;
    })}</details>}
  </section>;
}

/** One comparison, two original sides, one backend-authored difference. */
export function ExplanationGraphView({ analysis, evaluation, detail, view }: { analysis: SourceAnalysis; evaluation: EvaluationResult; detail: GraphDetail; view: "compare" | "explanation" }) {
  const comparison = detail.comparison;
  return <aside className="card evidence-card comparison-details" aria-label={view === "compare" ? "Comparison details" : "Explanation statement details"}>
    <div className="card-heading"><h2>{view === "compare" ? "Compare statements" : "Your explanation says"}</h2>{view === "compare" && comparison ? <StatusBadge status={comparison.status} /> : <span className="neutral-label">{view === "compare" ? "Not compared" : "Explanation"}</span>}</div>
    {view === "compare" && (detail.lesson.length ? <ClaimSide title="Lesson says" statements={detail.lesson} graph={analysis.graph} document={analysis.document} /> : <section className="comparison-side"><h3>Lesson says</h3><p>No linked reference claim. This additional idea is not automatically wrong.</p></section>)}
    {detail.learner.length ? <ClaimSide title="Your explanation says" statements={detail.learner} graph={evaluation.learnerGraph} document={evaluation.learnerDocument} /> : <section className="comparison-side"><h3>Your explanation says</h3><p>{comparison?.status === "missing" ? "Not mentioned in your explanation" : "No confirmed explanation counterpart"}</p></section>}
    {view === "compare" && <section className="comparison-difference"><h3>{comparison ? "Difference" : "Comparison context"}</h3><p>{comparison?.explanation ?? detail.additionalExplanation ?? "This reference claim has not been evaluated in the selected attempt."}</p>{!!comparison?.suggestions.length && <details><summary>Suggestions</summary><ul>{comparison.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}</section>}
  </aside>;
}
