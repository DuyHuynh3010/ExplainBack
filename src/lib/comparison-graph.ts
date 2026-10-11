import { MarkerType } from "@xyflow/react";
import type { ComparisonItem, EvaluationResult, KnowledgeGraph, Statement } from "@/backend/contracts/domain";
import { toReferenceFlow, type ReferenceNode, type ReferenceEdge } from "./reference-graph";
import { STATUS_COLORS } from "./evaluated-graph";

export type GraphView = "lesson" | "explanation" | "compare";
export const ALL_TOPICS = "__all__", ADDITIONAL_IDEAS = "__additional__";
export interface GraphDetail {
  id: string; lesson: Statement[]; learner: Statement[]; comparison?: ComparisonItem; additionalExplanation?: string;
}
export interface ExplorerFlow { nodes: ReferenceNode[]; edges: ReferenceEdge[]; details: GraphDetail[] }

// Topic views do not mutate or retopic either domain graph. The adapter receives
// only the selected statement subset; stable IDs still refer to original graphs.
function flowFor(graph: KnowledgeGraph, statements: Statement[]) {
  const view = { ...graph, statements: statements.map(s => ({ ...s, topicId: "view" })) };
  return toReferenceFlow(view, "view");
}
function decorate(graph: KnowledgeGraph, statements: Statement[], origin: "lesson" | "explanation") {
  const flow = flowFor(graph, statements);
  return {
    nodes: flow.nodes.map(n => ({ ...n, data: { ...n.data, origin,
      identities: [{ graphId: graph.id, id: n.data.referenceStatementId ?? n.id.slice(graph.id.length + 1), label: n.data.assertion ?? n.data.label, origin }] } })),
    edges: flow.edges.map(e => ({ ...e, data: { ...e.data!, origin,
      identities: [{ graphId: graph.id, id: e.data!.referenceStatementId, assertion: e.data!.assertion, origin }] } })),
  };
}
export function explanationClaims(evaluation: EvaluationResult, topicId: string): Statement[] {
  if (topicId === ALL_TOPICS) return evaluation.learnerGraph.statements;
  const ids = new Set(topicId === ADDITIONAL_IDEAS
    ? evaluation.additionalIdeas.flatMap(i => i.learnerStatements.map(r => r.statementId))
    : evaluation.comparisons.filter(c => c.topicId === topicId).flatMap(c => c.learnerStatements.map(r => r.statementId)));
  return evaluation.learnerGraph.statements.filter(s => ids.has(s.id));
}
export function toExplanationFlow(evaluation: EvaluationResult, topicId = ALL_TOPICS): ExplorerFlow {
  const statements = explanationClaims(evaluation, topicId);
  return { ...decorate(evaluation.learnerGraph, statements, "explanation"),
    details: statements.map(s => ({ id: s.id, lesson: [], learner: [s] })) };
}

/** One canvas/layout. Only validated, explicit semantic identities share positions.
 * No label similarity, topic order or participant overlap creates an alignment.
 */
export function toComparisonFlow(source: KnowledgeGraph, evaluation: EvaluationResult, topicId = ALL_TOPICS): ExplorerFlow {
  const comparisons = evaluation.comparisons.filter(c => topicId === ALL_TOPICS || c.topicId === topicId);
  const lessons = topicId === ADDITIONAL_IDEAS ? [] : source.statements.filter(s => topicId === ALL_TOPICS || s.topicId === topicId);
  const learners = explanationClaims(evaluation, topicId);
  const left = decorate(source, lessons, "lesson"), right = decorate(evaluation.learnerGraph, learners, "explanation");
  const nodeMap = new Map<string, string>();
  const leftIds = new Set(left.nodes.map(n => n.id));
  for (const a of evaluation.conceptAlignments ?? []) {
    const from = `${evaluation.learnerGraph.id}:${a.learnerConceptId}`, to = `${source.id}:${a.referenceConceptId}`;
    if (a.status === "matched" && leftIds.has(to)) nodeMap.set(from, to);
  }
  const map = (id: string) => nodeMap.get(id) ?? id;
  const learnerUse = new Map<string, number>();
  for (const c of comparisons) for (const r of c.learnerStatements) learnerUse.set(r.statementId, (learnerUse.get(r.statementId) ?? 0) + 1);
  const details: GraphDetail[] = comparisons.map(c => ({ id: c.id, comparison: c,
    lesson: lessons.filter(s => s.id === c.referenceRelationshipId),
    learner: learners.filter(s => c.learnerStatements.some(r => r.statementId === s.id)) }));
  const detailByLesson = new Map(details.flatMap(d => d.lesson.map(s => [s.id, d] as const)));
  for (const s of lessons) if (!detailByLesson.has(s.id)) {
    const d: GraphDetail = { id: `reference:${s.id}`, lesson: [s], learner: [] };
    details.push(d); detailByLesson.set(s.id, d);
  }
  // Learner claims may support multiple references: retain all feedback in the
  // panel through their refs. Choose one selection group, never duplicate claims.
  const detailByLearner = new Map<string, GraphDetail>();
  for (const d of details) for (const s of d.learner) if (!detailByLearner.has(s.id)) detailByLearner.set(s.id, d);
  for (const s of learners) if (!detailByLearner.has(s.id)) {
    const idea = evaluation.additionalIdeas.find(i => i.learnerStatements.some(r => r.statementId === s.id));
    const d = { id: `additional:${s.id}`, lesson: [], learner: [s], additionalExplanation: idea?.explanation };
    details.push(d); detailByLearner.set(s.id, d);
  }
  const mergedLearners = new Map<string, Statement>();
  const selectionIds = (claim: string, learner: boolean) => details.filter(d => (learner ? d.learner : d.lesson).some(s => s.id === claim)).map(d => d.id);
  const learnerStatuses = (claim: string) => new Set(details.filter(d => d.learner.some(s => s.id === claim)).flatMap(d => d.comparison ? [d.comparison.status] : []));
  const sameProjection = (l: Statement, r: Statement) => {
    if (l.representation.kind !== r.representation.kind || l.negated !== r.negated) return false;
    // A correct verdict is not permission to erase a differently worded claim,
    // formula or qualifier. Both is reserved for an identical displayed claim.
    if (l.assertion !== r.assertion || l.formula !== r.formula || JSON.stringify(l.conditions) !== JSON.stringify(r.conditions)) return false;
    const lr = l.representation, rr = r.representation;
    const concept = (id: string) => map(`${evaluation.learnerGraph.id}:${id}`);
    if (lr.kind === "binary" && rr.kind === "binary") return lr.relation === rr.relation && concept(rr.subjectConceptId) === `${source.id}:${lr.subjectConceptId}` && concept(rr.objectConceptId) === `${source.id}:${lr.objectConceptId}`;
    if (lr.kind === "complex" && rr.kind === "complex") {
      const a = lr.participants.map(p => `${source.id}:${p.conceptId}|${p.role}`).sort();
      const b = rr.participants.map(p => `${concept(p.conceptId)}|${p.role}`).sort();
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  };
  for (const d of details) {
    if (d.comparison?.status !== "correct" || d.lesson.length !== 1 || d.learner.length !== 1) continue;
    const l = d.lesson[0], r = d.learner[0];
    if (learnerUse.get(r.id) !== 1 || !sameProjection(l, r)) continue;
    mergedLearners.set(r.id, l);
    if (l.representation.kind === "complex") nodeMap.set(`relation:${evaluation.learnerGraph.id}:${r.id}`, `relation:${source.id}:${l.id}`);
  }
  const nodes = new Map<string, ReferenceNode>();
  for (const n of [...left.nodes, ...right.nodes]) {
    const id = map(n.id), old = nodes.get(id);
    const d = n.data.referenceStatementId ? (n.data.origin === "lesson" ? detailByLesson : detailByLearner).get(n.data.referenceStatementId) : undefined;
    if (old) nodes.set(id, { ...old, data: { ...old.data, origin: "both",
      ...(old.data.kind === "relation" && d?.comparison ? { status: d.comparison.status, statusNote: undefined } : {}),
      identities: [...(old.data.identities ?? []), ...(n.data.identities ?? [])],
      originalLabels: [...new Set([...(old.data.originalLabels ?? []), ...(n.data.label !== old.data.label ? [`Explanation: ${n.data.label}`] : [])])] } });
    else {
      const mixed = n.data.origin === "explanation" && learnerStatuses(n.data.referenceStatementId ?? "").size > 1;
      nodes.set(id, { ...n, id, data: { ...n.data, ...(d ? { selectionId: d.id, selectionIds: selectionIds(n.data.referenceStatementId!, n.data.origin === "explanation"),
        ...(n.data.origin === "lesson" ? { statusNote: "Reference claim" } : mixed ? { statusNote: "See matched comparisons" } : { status: d.comparison?.status }) } : {}) } });
    }
  }
  const edges: ReferenceEdge[] = [];
  for (const e of [...left.edges, ...right.edges]) {
    const learner = e.data!.origin === "explanation", claim = e.data!.referenceStatementId;
    if (learner && mergedLearners.has(claim)) continue;
    const d = (learner ? detailByLearner : detailByLesson).get(claim), mixed = learner && learnerStatuses(claim).size > 1;
    const status = mixed ? undefined : d?.comparison?.status;
    const bothClaim = !learner && [...mergedLearners.entries()].find(([, l]) => l.id === claim);
    const origin = bothClaim ? "both" as const : e.data!.origin!;
    const tag = origin === "both" ? "Both" : learner ? "Explanation" : "Lesson";
    const verdict = e.data!.kind === "binary" && origin !== "lesson" ? status : undefined;
    // Reference claims and complex participant connections are not graded errors.
    const color = verdict ? STATUS_COLORS[verdict] : learner ? "#7752a3" : "#526d65";
    const r = bothClaim ? learners.find(s => s.id === bothClaim[0])! : undefined;
    const edgeId = `${learner ? evaluation.learnerGraph.id : source.id}:${e.id}`;
    edges.push({ ...e, id: edgeId, sourceHandle: `${edgeId}:source`, targetHandle: `${edgeId}:target`, source: map(e.source), target: map(e.target),
      label: `${tag}: ${String(e.label).length > 72 ? `${String(e.label).slice(0, 69)}…` : e.label}`,
      style: { ...e.style, stroke: color, strokeDasharray: origin === "lesson" ? "7 4" : undefined },
      ...(e.markerEnd ? { markerEnd: { type: MarkerType.ArrowClosed, color } } : {}),
      data: { ...e.data!, origin, selectionId: d?.id ?? claim, selectionIds: selectionIds(claim, learner), ...(verdict ? { status: verdict } : {}),
        identities: [...(e.data!.identities ?? []), ...(r ? [{ graphId: evaluation.learnerGraph.id, id: r.id, assertion: r.assertion, origin: "explanation" as const }] : [])] } });
  }
  return { nodes: [...nodes.values()], edges, details };
}
