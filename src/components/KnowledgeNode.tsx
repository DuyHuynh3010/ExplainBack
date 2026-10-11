import { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { GitMerge } from "lucide-react";
import type { ReferenceNode } from "@/lib/reference-graph";
import { StatusBadge } from "./StatusBadge";

export function KnowledgeNode({ id, data }: NodeProps<ReferenceNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { if (data.ports) updateNodeInternals(id); }, [data.ports, id, updateNodeInternals]);
  return <div data-origin={data.origin} data-comparison-id={data.selectionId} className={`knowledge-node ${data.kind}${data.kind === "relation" && data.status ? ` verdict-${data.status}` : ""}`}>
    {data.kind === "relation" && <span className="relation-node-heading"><GitMerge size={16} />Complex relationship</span>}
    <div className="knowledge-node-label">{data.label}</div>
    {data.originalLabels?.map(label => <small className="original-concept-label" key={label}>{label}</small>)}
    {data.origin && <small className={`graph-provenance ${data.origin}`}>{data.origin === "both" ? "Both" : data.origin === "lesson" ? "Lesson" : "Explanation"}</small>}
    {data.kind === "relation" && <span className="node-verdict">{data.status ? <StatusBadge status={data.status} /> : data.statusNote ?? "Not evaluated"}</span>}
    {data.ports?.map(p => <Handle key={p.id} id={p.id} type={p.kind} position={p.kind === "source" ? Position.Right : Position.Left}
      style={{ left: p.x, top: p.y, right: "auto", transform: "translate(-50%, -50%)" }} isConnectable={false} />)}
  </div>;
}
