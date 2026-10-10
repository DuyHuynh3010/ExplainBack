const MAX_EXPLANATION_LENGTH = 10_000;

export function TranscriptEditor({ transcript, onChange, disabled = false }: { transcript: string; onChange: (value: string) => void; disabled?: boolean }) {
 const remaining = MAX_EXPLANATION_LENGTH - transcript.length;
 return <div className="transcript-editor"><div className="transcript-heading"><label htmlFor="transcript">Your explanation</label><span className="small-label">TYPE IN YOUR OWN WORDS</span></div><textarea id="transcript" rows={7} maxLength={MAX_EXPLANATION_LENGTH} disabled={disabled} placeholder="Explain the lesson as if you were teaching it to someone else…" value={transcript} onChange={e => onChange(e.target.value)} aria-describedby="explanation-help explanation-count" /><div className="source-meta"><p id="explanation-help" className="fine-print">Your text stays here if evaluation fails, so you can edit and try again.</p><span id="explanation-count">{remaining.toLocaleString()} characters left</span></div></div>;
}
