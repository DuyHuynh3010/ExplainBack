/** Test-only shape migration of immutable v1 captures. No semantic corrections,
 * concept merging, endpoint redirection, quote rewriting or production fallback. */
export function migrateLegacyDraft(value) {
  const draft = structuredClone(value);
  draft.concepts = draft.concepts.map(({ topicId: _topicId, ...c }) => c);
  draft.statements = draft.statements.map(({ subjectConceptId, relation, objectConceptId, ...s }) => ({
    ...s, representation: { kind: "binary", subjectConceptId, relation, objectConceptId },
  }));
  return draft;
}
