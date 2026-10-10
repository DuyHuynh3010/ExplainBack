import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { KnowledgeGraph } from "@/backend/contracts/domain";

export type ReferenceEdge = Edge<{ offset: number; selfLoop: boolean; statementId: string }>;

/** Deterministic frontend grid; every topic concept/statement is retained, including parallel edges. */
export function toReferenceFlow(graph: KnowledgeGraph, topicId: string, options: { columns?: number } = {}): { nodes: Node[]; edges: ReferenceEdge[] } {
  const concepts = graph.concepts.filter(c => c.topicId === topicId);
  const statements = graph.statements.filter(s => s.topicId === topicId);
  const nodeId = (id: string) => `${graph.id}:${id}`;
  const columns = options.columns ?? Math.min(3, Math.max(1, Math.ceil(Math.sqrt(concepts.length))));
  const nodes: Node[] = concepts.map((concept, index) => ({
    id: nodeId(concept.id), position: { x: (index % columns) * 290, y: Math.floor(index / columns) * 190 },
    data: { label: concept.symbol ? `${concept.name} (${concept.symbol})` : concept.name },
    sourcePosition: Position.Right, targetPosition: Position.Left,
    style: { width: 190, minHeight: 60, padding: 14, overflowWrap: "anywhere" },
  }));
  const groups = new Map<string, typeof statements>();
  for (const statement of statements) {
    const pair = JSON.stringify([statement.subjectConceptId, statement.objectConceptId].sort());
    groups.set(pair, [...(groups.get(pair) ?? []), statement]);
  }
  const edges: ReferenceEdge[] = statements.map(statement => {
    const group = groups.get(JSON.stringify([statement.subjectConceptId, statement.objectConceptId].sort()))!;
    const direction = statement.subjectConceptId <= statement.objectConceptId ? 1 : -1;
    return {
      id: statement.id, source: nodeId(statement.subjectConceptId), target: nodeId(statement.objectConceptId),
      type: "reference", label: `${statement.negated ? "not " : ""}${statement.relation}`,
      data: { offset: statement.subjectConceptId === statement.objectConceptId ? group.indexOf(statement) * 45 : (group.indexOf(statement) - (group.length - 1) / 2) * 65 * direction,
        selfLoop: statement.subjectConceptId === statement.objectConceptId, statementId: statement.id },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#74817d" },
      style: { stroke: "#74817d", strokeWidth: 1.8 },
    };
  });
  return { nodes, edges };
}
