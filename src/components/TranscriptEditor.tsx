import { DocumentUpload } from "./DocumentUpload";

export function TranscriptEditor({ file, onChange, onError, disabled = false }: { file: File | null; onChange: (file: File | null) => void; onError: (message: string) => void; disabled?: boolean }) {
 return <div className="transcript-editor"><DocumentUpload id="explanation-file" label="Upload your explanation" prompt="Choose an explanation file" file={file} onChange={onChange} onError={onError} disabled={disabled} /></div>;
}
