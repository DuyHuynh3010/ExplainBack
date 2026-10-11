import type { EvaluationResult, EvaluationStatus, KnowledgeGraph } from "@/backend/contracts/domain";
import { toReferenceFlow } from "./reference-graph";

export const STATUS_COLORS: Record<EvaluationStatus, string> = { correct: "#278466", partial: "#b47b18", contradicted: "#cc5151", missing: "#77828d", uncertain: "#7957a8" };
/** Overlay statuses only: endpoints, statement IDs, curves and source concepts stay intact. */
export function toEvaluatedFlow(graph: KnowledgeGraph, topicId: string, evaluation: EvaluationResult, options: Parameters<typeof toReferenceFlow>[2] = {}) {
  const flow = toReferenceFlow(graph, topicId, options);
  const comparison = (id: string | undefined) => evaluation.comparisons.find(c => c.referenceRelationshipId === id && c.sourceStatements.some(ref => ref.graphId === graph.id && ref.statementId === id));
  return { nodes: flow.nodes.map(node => ({ ...node, data: { ...node.data, ...(comparison(node.data.referenceStatementId) ? { status: comparison(node.data.referenceStatementId)!.status } : {}) } })), edges: flow.edges.map(edge => {
    const item = comparison(edge.data?.referenceStatementId);
    if (!item) return edge;
    const color = STATUS_COLORS[item.status];
    return { ...edge, data: { ...edge.data!, status: item.status }, label: `${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}: ${edge.label}`, style: { ...edge.style, stroke: color },
      markerEnd: typeof edge.markerEnd === "object" ? { ...edge.markerEnd, color } : edge.markerEnd };
  }) };
}
