import type { EvaluationResult, KnowledgeGraph } from "../contracts/domain";
import type { ValidationIssue } from "../contracts/validate";

/** Only discard existing-ID optional suggestions rejected by the strict validator
 * for lack of a linked comparison. Never repair identities, links or graph data.
 * Other alignment errors (including unknown IDs/duplicates) remain mandatory.
 */
export function sanitizeUnsupportedConceptAlignments(
  source: KnowledgeGraph, evaluation: EvaluationResult, issues: ValidationIssue[],
): { evaluation: EvaluationResult; removed: ValidationIssue[] } {
  const alignments = evaluation.conceptAlignments;
  if (!alignments?.length) return { evaluation, removed: [] };
  const root = "$.data.conceptAlignments";
  // A collection-level invariant such as duplicate learner IDs must not disappear
  // as a side effect of removing a suggestion.
  if (issues.some(i => i.path === root)) return { evaluation, removed: [] };
  const sourceIds = new Set(source.concepts.map(c => c.id));
  const learnerIds = new Set(evaluation.learnerGraph.concepts.map(c => c.id));
  const indices = new Set<number>();
  const removed: ValidationIssue[] = [];
  for (const issue of issues) {
    if (issue.code !== "reference" || issue.ruleId !== "unsupported_concept_alignment") continue;
    const indexText = issue.path.match(/^\$\.data\.conceptAlignments\[(\d+)\]$/)?.[1];
    if (indexText === undefined) continue;
    const index = Number(indexText), alignment = alignments[index];
    if (!alignment || !sourceIds.has(alignment.referenceConceptId) || !learnerIds.has(alignment.learnerConceptId)) continue;
    const path = `${root}[${index}]`;
    if (issues.some(i => i !== issue && (i.path === path || i.path.startsWith(`${path}.`) || i.path.startsWith(`${path}[`)))) continue;
    indices.add(index); removed.push(issue);
  }
  return { evaluation: indices.size ? { ...evaluation, conceptAlignments: alignments.filter((_, index) => !indices.has(index)) } : evaluation, removed };
}
