export function TranscriptEditor({ transcript, onChange }: { transcript: string; onChange: (value: string) => void }) {
 return <div className="transcript-editor"><div className="transcript-heading"><label htmlFor="transcript">Your transcript</label><span className="small-label">EDITABLE SAMPLE</span></div><textarea id="transcript" rows={5} value={transcript} onChange={e => onChange(e.target.value)} /><p className="fine-print">A fixed sample transcript, not a transcription of your voice. You can edit it locally.</p></div>;
}
