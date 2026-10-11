import type { Statement, StatementRepresentation } from "./domain";

export function referencedConceptIds(representation: StatementRepresentation): string[] {
  return representation.kind === "binary"
    ? [representation.subjectConceptId, representation.objectConceptId]
    : representation.participants.map(p => p.conceptId);
}

export function statementLabel(statement: Statement): string {
  const r = statement.representation;
  return r.kind === "complex" ? statement.assertion : `${statement.negated ? "not " : ""}${r.relation}`;
}
