import { DocumentUpload } from "./DocumentUpload";
import { SOURCE_LIMITS } from "@/backend/contracts/source-limits";

export function TranscriptEditor({ file, onChange, onError, disabled = false }: { file: File | null; onChange: (file: File | null) => void; onError: (message: string) => void; disabled?: boolean }) {
 return <div className="transcript-editor"><DocumentUpload id="explanation-file" label="Upload your explanation" prompt="Choose an explanation file" file={file} onChange={onChange} onError={onError} disabled={disabled} acceptedExtensions={["pdf", "docx"]} accept=".pdf,.docx" formatLabel="PDF / DOCX" formatDescription="PDF or Word (.docx)" fileTypeError="Choose a PDF or DOCX file." maxFileSize={SOURCE_LIMITS.fileBytes} maxFileSizeLabel="3,000,000 bytes" note="Import the file to review and edit its extracted text before evaluating." /></div>;
}
