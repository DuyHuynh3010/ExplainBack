import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { ReferenceEdge as ReferenceEdgeType } from "@/lib/reference-graph";

/** Distinct quadratic curves for parallel and reverse-direction statements. */
export function ReferenceEdge({ id, sourceX, sourceY, targetX, targetY, label, data, markerEnd, style, selected }: EdgeProps<ReferenceEdgeType>) {
  const dx = targetX - sourceX, dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const offset = data?.offset ?? 0;
  const cx = (sourceX + targetX) / 2 - dy / length * offset;
  const cy = (sourceY + targetY) / 2 + dx / length * offset;
  const loopHeight = 100 + Math.abs(offset);
  const path = data?.selfLoop
    ? `M ${sourceX},${sourceY} C ${sourceX + 100},${sourceY - loopHeight} ${targetX - 100},${targetY - loopHeight} ${targetX},${targetY}`
    : `M ${sourceX},${sourceY} Q ${cx},${cy} ${targetX},${targetY}`;
  const labelX = data?.selfLoop ? (sourceX + targetX) / 2 : (sourceX + 2 * cx + targetX) / 4;
  const labelY = data?.selfLoop ? sourceY - loopHeight * 0.75 : (sourceY + 2 * cy + targetY) / 4;
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, strokeWidth: selected ? 3 : 1.8 }} />
    <EdgeLabelRenderer><span title={data?.assertion} className={`reference-edge-label ${selected ? "selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}>{label}</span></EdgeLabelRenderer>
  </>;
}
