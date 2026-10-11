import type { AnalysisDraft } from "./draft";
import type { AnalysisWarning, ImportedSource } from "../contracts/domain";
import { referencedConceptIds } from "../contracts/graph";
import { explicitScopes } from "../contracts/statement-scope";

const fold = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Source-only review diagnostics, not rejection, entailment or grading rules.
 * Literal omissions may be explained by paraphrase. Never infer missing facts. */
export function reviewExtraction(source: ImportedSource, draft: AnalysisDraft): {
  warning: AnalysisWarning; draftStatementId?: string;
}[] {
  const findings: ReturnType<typeof reviewExtraction> = [];
  const add = (message: string, blockId: string, draftStatementId?: string) => findings.push({
    warning: { code: "EXTRACTION_REVIEW", message, blockId }, draftStatementId,
  });
  for (const statement of draft.statements) {
    const r = statement.representation;
    const represented = new Set(referencedConceptIds(r));
    const supporting = statement.evidence.map(e => e.quote).join(" ");
    const actual = fold([statement.assertion, ...statement.conditions].join(" "));
    const endpoints = draft.concepts.filter(c => represented.has(c.id));
    for (const scope of explicitScopes(supporting, endpoints)) {
      if (!actual.includes(fold(scope))) add("A source scope phrase has no literal counterpart in this assertion or its conditions. Review qualification; paraphrase may explain the difference.", statement.evidence[0].blockId, statement.id);
    }
    if (r.kind !== "complex") continue;
    // Longest names occupy their spans first: Chemical energy must not imply a
    // mention of the distinct canonical Energy concept just because words overlap.
    const occupied: { start: number; end: number }[] = [];
    const mentions = draft.concepts.flatMap(c => [c.name, ...c.aliases].filter(n => n.trim().length > 2).map(name => ({ c, name })))
      .sort((a, b) => b.name.length - a.name.length);
    const mentioned = new Set<string>();
    for (const { c, name } of mentions) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "giu");
      for (const match of statement.assertion.matchAll(pattern)) {
        const start = match.index!, end = start + match[0].length;
        if (occupied.some(span => start < span.end && end > span.start)) continue;
        occupied.push({ start, end }); mentioned.add(c.id);
      }
    }
    const missing = [...mentioned].filter(id => !represented.has(id));
    if (!missing.length) continue;
    const linked = missing.every(id => draft.statements.some(other => other.id !== statement.id && referencedConceptIds(other.representation).includes(id) &&
      other.evidence.some(e => statement.evidence.some(s => e.blockId === s.blockId && e.quote === s.quote))));
    if (!linked) add("A known concept named in a complex assertion is absent from its participants and from claims sharing that exact evidence. Review whether it is essential; incidental mentions need not be nodes.", statement.evidence[0].blockId, statement.id);
  }
  for (const block of source.document.blocks) {
    const statements = draft.statements.filter(s => s.evidence.some(e => e.blockId === block.id));
    const descriptions = statements.map(s => fold([s.assertion, ...s.conditions].join(" ")));
    // Narrow, explicit source cue. This does not infer what a technical term means.
    const definitions = block.text.matchAll(/\bmeaning(?:\s+that)?\s+([^.;\n]+?)(?=,\s*(?:while|whereas)|[.;\n]|$)/gi);
    for (const match of definitions) {
      const predicate = fold(match[1]).replace(/^(?:it|they|this|that)\s+/, "");
      if (predicate && !descriptions.some(text => text.includes(predicate))) {
        add("An explicit explanatory 'meaning' clause has no recognized literal counterpart in the source statements. Review definition coverage; a paraphrase may already express it. A matching quote or summary alone does not establish coverage.", block.id);
      }
    }
  }
  return findings;
}
