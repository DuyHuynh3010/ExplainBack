import type { ImportedSource, SourceAnalysis } from "../contracts/domain";
import type { AnalysisDraft } from "./draft";
import { sourceOutput } from "./output-normalization";
export { canonicalConcepts } from "./concept-catalog";

/** Input guard only; output quality never prevents a readable graph. */
export function isExplicitQuestionText(text: string): boolean {
  const sentences = text.trim().split(/(?<=[.!?\uFF1F])\s+|\n+/u).filter(Boolean);
  return sentences.length > 0 && sentences.every(s => /[?\uFF1F]$/.test(s.trim()));
}

export function normalizeAnalysisDraft(source: ImportedSource, draft: AnalysisDraft, observe?: (candidate: SourceAnalysis) => void): SourceAnalysis {
  const result = sourceOutput(source, draft);
  observe?.(result);
  return result;
}
