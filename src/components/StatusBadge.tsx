import type { Status } from "@/types/lesson";
export function StatusBadge({ status }: { status: Status }) { return <span className={`status-badge ${status}`}><span aria-hidden="true" />{status.charAt(0).toUpperCase() + status.slice(1)}</span>; }
