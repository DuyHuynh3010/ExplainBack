import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { KnowledgeGraph, Statement, Concept, EvaluationStatus } from "@/backend/contracts/domain";
import { referencedConceptIds, statementLabel } from "../backend/contracts/graph";
import { explicitScopes } from "../backend/contracts/statement-scope";

export type ReferenceNode = Node<{ label: string; kind: "concept" | "relation"; assertion?: string;
  referenceStatementId?: string; status?: EvaluationStatus; statusNote?: string;
  selectionId?: string; selectionIds?: string[]; origin?: "lesson" | "explanation" | "both"; originalLabels?: string[];
  identities?: { graphId: string; id: string; label: string; origin: "lesson" | "explanation" }[];
  ports?: { id: string; kind: "source" | "target"; x: number; y: number }[] }>;
export type ReferenceEdge = Edge<{ offset: number; selfLoop: boolean; statementId: string;
  referenceStatementId: string; assertion: string; kind: "binary" | "role"; status?: EvaluationStatus;
  selectionId?: string; selectionIds?: string[]; origin?: "lesson" | "explanation" | "both";
  onSelect?: () => void;
  identities?: { graphId: string; id: string; assertion: string; origin: "lesson" | "explanation" }[];
  points?: { x: number; y: number }[]; labelPosition?: { x: number; y: number }; labelWidth?: number }>;

/** A display excerpt, never a new assertion or an AI-generated relationship. */
export function complexLabel(assertion: string): string {
  if (assertion.length <= 100) return assertion;
  return `${assertion.slice(0, 97).replace(/\s+\S*$/, "")}…`;
}

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

/** Domain identities stay intact; complex role connections are visual, not new statements. */
export function toReferenceFlow(graph: KnowledgeGraph, topicId: string, options: { columns?: number; includeIsolated?: boolean } = {}): { nodes: ReferenceNode[]; edges: ReferenceEdge[] } {
  const selected = graph.statements.filter(s => s.topicId === topicId);
  const visible = new Set(selected.flatMap(s => referencedConceptIds(s.representation)));
  // A readable concepts-only result still has graph content to display. No
  // statement, membership or relationship is invented to connect these nodes.
  const concepts = graph.concepts.filter(c => visible.has(c.id) || (options.includeIsolated ?? !graph.statements.length));
  const statements = selected.flatMap(s => s.representation.kind === "binary" ? [{ ...s, ...s.representation }] : []);
  const nodeId = (id: string) => `${graph.id}:${id}`;
  const nodes: ReferenceNode[] = concepts.map(concept => ({
    id: nodeId(concept.id), type: "knowledge", position: { x: 0, y: 0 },
    data: { kind: "concept", label: concept.symbol ? `${concept.name} (${concept.symbol})` : concept.name },
    style: { width: 220 },
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
        selfLoop: statement.subjectConceptId === statement.objectConceptId, statementId: statement.id,
        referenceStatementId: statement.id, assertion: statement.assertion, kind: "binary" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#74817d" },
      style: { stroke: "#526d65", strokeWidth: 2.4 },
    };
  });
  for (const statement of selected) {
    if (statement.representation.kind !== "complex") continue;
    const relationId = `relation:${graph.id}:${statement.id}`;
    nodes.push({ id: relationId, type: "knowledge", position: { x: 0, y: 0 }, style: { width: 260 },
      data: { kind: "relation", label: complexLabel(statement.assertion), assertion: statement.assertion, referenceStatementId: statement.id } });
    statement.representation.participants.forEach((p, index) => {
      const output = p.role.trim().toLowerCase() === "output";
      const directed = output || ["agent", "input"].includes(p.role.trim().toLowerCase());
      edges.push({ id: `role:${statement.id}:${index}`, source: output ? relationId : nodeId(p.conceptId),
        target: output ? nodeId(p.conceptId) : relationId, type: "reference", label: p.role,
        ...(directed ? { markerEnd: { type: MarkerType.ArrowClosed, color: "#526d65" } } : {}),
        style: { stroke: "#526d65", strokeWidth: 2.4, ...(directed ? {} : { strokeDasharray: "5 4" }) },
        data: { kind: "role", offset: 0, selfLoop: false, statementId: statement.id,
          referenceStatementId: statement.id, assertion: statement.assertion } });
    });
  }
  for (const edge of edges) {
    edge.sourceHandle = `${edge.id}:source`;
    edge.targetHandle = `${edge.id}:target`;
  }
  return { nodes, edges };
}

export type GraphSelection = { kind: "node" | "statement"; id: string } | null;
export function selectionNodeIds(flow: ReturnType<typeof toReferenceFlow>, selection: GraphSelection): Set<string> {
  if (!selection) return new Set();
  const edges = flow.edges.filter(e => selection.kind === "node" ? e.source === selection.id || e.target === selection.id
    : (e.data?.selectionIds ?? [e.data?.selectionId ?? e.data?.referenceStatementId]).includes(selection.id));
  const ids = new Set(edges.flatMap(e => [e.source, e.target]));
  for (const n of flow.nodes) if (selection.kind === "node" ? n.id === selection.id
    : (n.data.selectionIds ?? [n.data.selectionId ?? n.data.referenceStatementId]).includes(selection.id)) ids.add(n.id);
  return ids;
}
/** Highlight traversal never mutates domain data, layout or the viewport. */
export function highlightedGraph(flow: ReturnType<typeof toReferenceFlow>, selection: GraphSelection) {
  if (!selection) return flow;
  const edgeIds = new Set(flow.edges.filter(e => selection.kind === "node"
    ? e.source === selection.id || e.target === selection.id
    : (e.data?.selectionIds ?? [e.data?.selectionId ?? e.data?.referenceStatementId]).includes(selection.id)).map(e => e.id));
  const nodeIds = selectionNodeIds(flow, selection);
  return { nodes: flow.nodes.map(n => ({ ...n, className: nodeIds.has(n.id) ? "graph-highlight" : "graph-dim" })),
    edges: flow.edges.map(e => ({ ...e, selected: edgeIds.has(e.id), style: { ...e.style, opacity: edgeIds.has(e.id) ? 1 : 0.52 } })) };
}
