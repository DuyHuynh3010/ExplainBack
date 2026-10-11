import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { ReferenceEdge as ReferenceEdgeType } from "@/lib/reference-graph";
import { StatusBadge } from "./StatusBadge";

/** ELK routes preserve role connections, parallel/reverse edges and original IDs. */
export function ReferenceEdge({ id, sourceX, sourceY, targetX, targetY, label, data, markerEnd, style, selected }: EdgeProps<ReferenceEdgeType>) {
  const dx = targetX - sourceX, dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const offset = data?.offset ?? 0;
  const cx = (sourceX + targetX) / 2 - dy / length * offset;
  const cy = (sourceY + targetY) / 2 + dx / length * offset;
  const loopHeight = 100 + Math.abs(offset);
  const fallback = data?.selfLoop
    ? `M ${sourceX},${sourceY} C ${sourceX + 100},${sourceY - loopHeight} ${targetX - 100},${targetY - loopHeight} ${targetX},${targetY}`
    : `M ${sourceX},${sourceY} Q ${cx},${cy} ${targetX},${targetY}`;
  const path = data?.points?.map((p, i) => `${i ? "L" : "M"} ${p.x},${p.y}`).join(" ") ?? fallback;
  const labelX = data?.labelPosition?.x ?? (data?.selfLoop ? (sourceX + targetX) / 2 : (sourceX + 2 * cx + targetX) / 4);
  const labelY = data?.labelPosition?.y ?? (data?.selfLoop ? sourceY - loopHeight * 0.75 : (sourceY + 2 * cy + targetY) / 4);
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, strokeWidth: selected ? 3.6 : 2.4 }} />
    <EdgeLabelRenderer><button onClick={event => { event.stopPropagation(); data?.onSelect?.(); }} data-origin={data?.origin} data-comparison-id={data?.selectionId} title={data?.kind === "binary" ? data.assertion : undefined} className={`reference-edge-label nodrag nopan ${selected ? "selected" : ""}`} style={{ opacity: style?.opacity, width: data?.labelWidth, transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}>{label}{data?.status && <StatusBadge status={data.status} />}</button></EdgeLabelRenderer>
  </>;
}
