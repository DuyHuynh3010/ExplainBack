import type { AnalysisDraft } from "./draft";
import { readableAnalysisDraft } from "./output-normalization";

/** Already-normalized part IDs define identity. Labels never merge records. */
export function canonicalConcepts(concepts: AnalysisDraft["concepts"]): AnalysisDraft["concepts"] {
  return [...new Map(concepts.map(c => [c.id, c])).values()];
}

/** Resolve explicit catalog IDs before deciding whether an edge can be drawn. */
export function resolveDraftConcepts(input: AnalysisDraft, catalog: AnalysisDraft["concepts"] = []): AnalysisDraft {
  return readableAnalysisDraft(input, catalog);
}
