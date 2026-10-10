import type { ComparisonItem, EvaluationResult } from "@/backend/contracts/domain";
import { StatusBadge } from "./StatusBadge";

export function ExplanationFeedback({ evaluation, comparison }: { evaluation: EvaluationResult; comparison: ComparisonItem }) {
  return <article className="card evidence-card" aria-label="Explanation feedback">
    <div className="card-heading"><h2>Your explanation feedback</h2><StatusBadge status={comparison.status} /></div>
    <p>{comparison.explanation}</p>
    <div className="evidence-section"><span className="eyebrow">LEARNER EVIDENCE</span>
      {!comparison.learnerStatements.length && <p className="not-mentioned">{comparison.status === "missing" ? "This idea is not expressed in this explanation. This does not show that you do not understand it." : "No supported matching learner statement was identified."}</p>}
      {comparison.learnerStatements.map(ref => {
        const statement = evaluation.learnerGraph.statements.find(s => s.id === ref.statementId)!;
        return <div key={statement.id}><p>{statement.assertion}</p>{statement.evidenceIds.map(id => {
          const evidence = evaluation.learnerGraph.evidence.find(e => e.id === id)!;
          const range = evidence.location?.charRange;
          return <div key={id}><blockquote className="source-quote">{evidence.quote}</blockquote><p>{evidence.verification}{range ? ` / Learner block UTF-16 [${range.start}, ${range.end})` : " / No unique range"}</p></div>;
        })}</div>;
      })}
    </div>
    {!!comparison.suggestions.length && <div className="evidence-section"><span className="eyebrow">SUGGESTIONS</span><ul>{comparison.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
  </article>;
}
