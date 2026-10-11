import { Info } from "lucide-react";
import type { ImportedSource, SourceAnalysis, Statement } from "@/backend/contracts/domain";

export function SourceEvidenceDetails({ analysis, importedSource, statement, evaluated = false }: { analysis: SourceAnalysis; importedSource: ImportedSource; statement: Statement; evaluated?: boolean }) {
  const concepts = new Map(analysis.graph.concepts.map(c => [c.id, c]));
  return <aside className="card evidence-card" aria-label="Source relationship details">
    <div className="card-heading"><div><Info size={19} /><h2>Source relationship</h2></div><span className="small-label">{evaluated ? "SOURCE EVIDENCE" : "NOT EVALUATED"}</span></div>
    <span className="eyebrow">SOURCE ASSERTION</span><h3 className="expected">{statement.assertion}</h3>
    {statement.representation.kind === "binary" ? <p className="relation-direction">{concepts.get(statement.representation.subjectConceptId)?.name} → {statement.negated ? "not " : ""}{statement.representation.relation} → {concepts.get(statement.representation.objectConceptId)?.name}</p>
      : <div className="evidence-section"><span className="eyebrow">COMPLEX STATEMENT PARTICIPANTS</span><ul>{statement.representation.participants.map((p, i) => <li key={i}>{p.role}: {concepts.get(p.conceptId)?.name}</li>)}</ul><p>All canvas role connections represent this one complete statement.</p></div>}
    <div className="evidence-section"><span className="eyebrow">ROLE & POLARITY</span><p>{statement.role} · {statement.negated ? "Negated" : "Affirmative"}</p></div>
    {!!statement.conditions.length && <div className="evidence-section"><span className="eyebrow">CONDITIONS</span><ul>{statement.conditions.map((condition, i) => <li key={i}>{condition}</li>)}</ul></div>}
    {statement.formula && <div className="evidence-section"><span className="eyebrow">SOURCE FORMULA</span><p className="formula-text">{statement.formula}</p></div>}
    {statement.evidenceIds.map(id => {
      const evidence = analysis.graph.evidence.find(e => e.id === id)!;
      const block = importedSource.document.blocks.find(b => b.id === evidence.blockId)!;
      const range = evidence.location?.charRange;
      return <div className="evidence-section" key={id}>
        <span className="eyebrow">SOURCE EVIDENCE · {evidence.verification}</span>
        <blockquote className="source-quote">“{evidence.quote}”</blockquote>
        <p>{importedSource.document.title || "Untitled source"} · {importedSource.document.kind.toUpperCase()}
          {block.location?.page !== undefined && ` · Page ${block.location.page}`}
          {block.location?.paragraph !== undefined && ` · Paragraph ${block.location.paragraph}`}
          {block.location?.section && ` · ${block.location.section}`}
          {range && ` · Block UTF-16 [${range.start}, ${range.end})`}
        </p>
        {evidence.verification === "unverified" && <p>Quote position is unverified. No unique highlight is asserted.</p>}
        <details><summary>View source block</summary><p className="source-block-text">{block.text}</p></details>
      </div>;
    })}
    <p className="fine-print">Verified means the quote was located in the source. It does not establish scientific truth or evaluate your explanation.</p>
  </aside>;
}
