import type { AnalysisDraft } from "./draft";
import { DraftError, type DraftIssue } from "./errors";

/** Explicit IDs define identity; labels/aliases never rescue a missing reference. */
export function canonicalConcepts(concepts: AnalysisDraft["concepts"]): AnalysisDraft["concepts"] {
  const records = new Map<string, AnalysisDraft["concepts"][number]>();
  for (const [i, concept] of concepts.entries()) {
    const previous = records.get(concept.id);
    const signature = (c: typeof concept) => JSON.stringify([c.name, [...new Set(c.aliases)].sort(), c.symbol]);
    if (previous && signature(previous) !== signature(concept)) throw new DraftError("Conflicting records for one canonical concept ID.", [{ path: `$.concepts[${i}].id`, code: "invariant", message: "Conflicting records for one canonical concept ID.", ruleId: "concept_identity_conflict", ids: { conceptId: concept.id } }]);
    if (!previous) records.set(concept.id, concept);
  }
  return [...records.values()];
}

/** Catalog must come from validated completed parts of this same source. Own all
 * records so resolving a part never changes the caller's draft or checkpoint. */
export function resolveDraftConcepts(input: AnalysisDraft, catalog: AnalysisDraft["concepts"] = []): AnalysisDraft {
  const draft = structuredClone(input);
  const known = new Map(canonicalConcepts(catalog).map(c => [c.id, c]));
  const local = new Map(canonicalConcepts(draft.concepts).map(c => [c.id, c]));
  const issues: DraftIssue[] = [];
  draft.concepts.forEach((c, i) => {
    const established = known.get(c.id);
    if (!established) return;
    if (c.name !== established.name || c.symbol !== established.symbol) issues.push({ path: `$.concepts[${i}].id`, code: "invariant", ruleId: "concept_identity_conflict", message: "A reused canonical concept ID cannot change its name/symbol.", ids: { conceptId: c.id }, catalogFound: true });
    else local.set(c.id, structuredClone(established)); // Established aliases remain canonical.
  });
  const use = (id: string, path: string, statementId: string) => {
    if (local.has(id)) return;
    const established = known.get(id);
    if (established) local.set(id, structuredClone(established));
    else issues.push({ path, code: "reference", ruleId: "missing_concept", message: "Endpoint/participant concept has no local record or exact catalog record.", ids: { statementId, conceptId: id }, catalogFound: false });
  };
  draft.statements.forEach((s, i) => {
    const path = `$.statements[${i}].representation`, r = s.representation;
    if (r.kind === "binary") {
      use(r.subjectConceptId, `${path}.subjectConceptId`, s.id);
      use(r.objectConceptId, `${path}.objectConceptId`, s.id);
    } else r.participants.forEach((p, j) => use(p.conceptId, `${path}.participants[${j}].conceptId`, s.id));
  });
  if (issues.length) throw new DraftError("Concept references or catalog identities are invalid.", issues);
  draft.concepts = [...local.values()];
  return draft;
}
