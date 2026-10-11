import type { Statement, StatementRepresentation } from "./domain";

export function referencedConceptIds(representation: StatementRepresentation): string[] {
  return representation.kind === "binary"
    ? [representation.subjectConceptId, representation.objectConceptId]
    : representation.participants.map(p => p.conceptId);
}

/** Preserve endpoints, direction, all participant occurrences and roles while remapping IDs. */
export function remapRepresentation(representation: StatementRepresentation, resolve: (id: string, field: string) => string): StatementRepresentation {
  return representation.kind === "binary"
    ? { ...representation, subjectConceptId: resolve(representation.subjectConceptId, "subjectConceptId"), objectConceptId: resolve(representation.objectConceptId, "objectConceptId") }
    : { kind: "complex", participants: representation.participants.map((p, i) => ({ ...p, conceptId: resolve(p.conceptId, `participants[${i}].conceptId`) })) };
}

export function statementLabel(statement: Statement): string {
  const r = statement.representation;
  return r.kind === "complex" ? statement.assertion : `${statement.negated ? "not " : ""}${r.relation}`;
}
