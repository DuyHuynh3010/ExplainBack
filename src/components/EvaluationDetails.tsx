import { Quote } from "lucide-react";
import type { Relationship } from "@/types/lesson";
import { StatusBadge } from "./StatusBadge";
export function EvaluationDetails({ relationship: r }: { relationship: Relationship }) {
 return <aside className="card evidence-card" aria-labelledby="evidence-heading" aria-live="polite"><div className="card-heading"><div><Quote size={19} /><h2 id="evidence-heading">Relationship details</h2></div></div><StatusBadge status={r.status} /><h3 className="expected">{r.expected}</h3><div className="evidence-section"><span className="eyebrow">STUDENT’S SAMPLE STATEMENT</span>{r.statement ? <blockquote>“{r.statement}”</blockquote> : <p className="not-mentioned">Not mentioned</p>}</div><div className="evidence-section"><span className="eyebrow">FROM THE SAMPLE SOURCE</span><blockquote className="source-quote">“{r.quote}”</blockquote></div><div className="evidence-section"><span className="eyebrow">WHY THIS STATUS?</span><p>{r.explanation}</p></div><p className="fine-print">Evidence refers to the fixed sample lesson and transcript.</p></aside>;
}
