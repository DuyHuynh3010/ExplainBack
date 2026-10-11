import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { KnowledgeGraph, Statement, Concept } from "@/backend/contracts/domain";
import { referencedConceptIds, statementLabel } from "../backend/contracts/graph";
import { explicitScopes } from "../backend/contracts/statement-scope";

export type ReferenceEdge = Edge<{ offset: number; selfLoop: boolean; statementId: string; assertion: string }>;

/** Keep statement-level qualifiers visible without changing document-wide nodes. */
export function referenceRelationshipLabel(statement: Statement, concepts: Concept[]): string {
  if (statement.representation.kind === "complex") return statement.assertion;
  const ids = new Set(referencedConceptIds(statement.representation));
  const scopes = explicitScopes(statement.assertion, concepts.filter(c => ids.has(c.id)));
  const details = [...statement.conditions];
  for (const scope of scopes) if (!details.some(c => c.toLowerCase().includes(scope.toLowerCase()))) details.push(scope);
  // A qualified paraphrase may not use the concept's literal name. Show the actual
  // assertion rather than manufacturing a broad relation from an unknown scope.
  if (!scopes.length && /\b(?:some|most|only|not all)\b/i.test(statement.assertion) && !details.length) return statement.assertion;
  return `${statementLabel(statement)}${details.length ? ` · ${[...new Set(details)].join("; ")}` : ""}`;
}

/** Deterministic frontend grid; selected endpoints/participants are visible; only binary statements become edges. */
export function toReferenceFlow(graph: KnowledgeGraph, topicId: string, options: { columns?: number } = {}): { nodes: Node[]; edges: ReferenceEdge[] } {
  const selected = graph.statements.filter(s => s.topicId === topicId);
  const visible = new Set(selected.flatMap(s => referencedConceptIds(s.representation)));
  const concepts = graph.concepts.filter(c => visible.has(c.id));
  const statements = selected.flatMap(s => s.representation.kind === "binary" ? [{ ...s, ...s.representation }] : []);
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
      type: "reference", label: referenceRelationshipLabel(statement, graph.concepts),
      data: { offset: statement.subjectConceptId === statement.objectConceptId ? group.indexOf(statement) * 45 : (group.indexOf(statement) - (group.length - 1) / 2) * 65 * direction,
        selfLoop: statement.subjectConceptId === statement.objectConceptId, statementId: statement.id, assertion: statement.assertion },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#74817d" },
      style: { stroke: "#74817d", strokeWidth: 1.8 },
    };
  });
  return { nodes, edges };
}
