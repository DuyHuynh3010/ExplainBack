import type { AnalysisDraft } from "./draft";
import { referencedConceptIds } from "../contracts/graph";
import { DraftError, type DraftIssue } from "./errors";

/** Check document-wide concept references and primary-topic lesson links; never guess endpoints. */
export function checkDraftReferences(draft: AnalysisDraft): void {
  const issues: DraftIssue[] = [];
  const topics = new Set(draft.topics.map(t => t.id));
  const concepts = new Map(draft.concepts.map(c => [c.id, c]));
  const statements = new Map(draft.statements.map(s => [s.id, s]));
  const add = (path: string, message: string, ids: Record<string, string>, code: DraftIssue["code"] = "reference") => issues.push({ path, code, message, ids });
  draft.statements.forEach((statement, i) => {
    const path = `$.statements[${i}]`;
    if (!topics.has(statement.topicId)) add(`${path}.topicId`, "Unknown statement topic.", { statementId: statement.id, topicId: statement.topicId });
    const r = statement.representation;
    referencedConceptIds(r).forEach((id, j) => {
      const field = r.kind === "binary" ? (j === 0 ? ".representation.subjectConceptId" : ".representation.objectConceptId") : `.representation.participants[${j}].conceptId`;
      if (!concepts.has(id)) add(`${path}${field}`, "Unknown endpoint/participant concept in this document graph.", { statementId: statement.id, conceptId: id });
    });
  });
  draft.lessonSections.forEach((section, i) => {
    const path = `$.lessonSections[${i}]`;
    if (!topics.has(section.topicId)) add(`${path}.topicId`, "Unknown lesson topic.", { topicId: section.topicId });
    const links = (ids: string[], prefix: string) => ids.forEach((id, j) => {
      const statement = statements.get(id);
      if (!statement) add(`${prefix}[${j}]`, "Unknown lesson statement.", { topicId: section.topicId, statementId: id });
      else if (statement.topicId !== section.topicId) add(`${prefix}[${j}]`, "Lesson links must refer to statements in the section's own topic.", { topicId: section.topicId, statementId: id, statementTopicId: statement.topicId }, "invariant");
    });
    links(section.statementIds, `${path}.statementIds`);
    section.keyPoints.forEach((point, j) => links(point.statementIds, `${path}.keyPoints[${j}].statementIds`));
  });
  if (issues.length) throw new DraftError("AI draft has invalid topic, endpoint or lesson references.", issues);
}
