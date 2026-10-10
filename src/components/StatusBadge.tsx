import type { EvaluationStatus } from "@/backend/contracts/domain";
export function StatusBadge({ status }: { status: EvaluationStatus }) { return <span className={`status-badge ${status}`}><span aria-hidden="true" />{status.charAt(0).toUpperCase() + status.slice(1)}</span>; }
