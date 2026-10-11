/** Shared source/learner quote locator. Hints never invalidate a unique quote. */
export interface QuoteHint { quote: string; contextBefore?: string; contextAfter?: string }
export function locateQuote(text: string, hint: QuoteHint): {
  occurrences: number; range?: { start: number; end: number }; contextBefore?: string; contextAfter?: string;
} {
  if (!hint.quote.trim()) return { occurrences: 0 };
  const matches: number[] = [];
  for (let at = text.indexOf(hint.quote); at >= 0; at = text.indexOf(hint.quote, at + 1)) matches.push(at);
  if (!matches.length) return { occurrences: 0 };
  let candidates = matches;
  if (matches.length > 1 && (hint.contextBefore?.trim() || hint.contextAfter?.trim())) {
    const narrowed = matches.filter(at =>
      (!hint.contextBefore?.trim() || text.slice(0, at).endsWith(hint.contextBefore)) &&
      (!hint.contextAfter?.trim() || text.slice(at + hint.quote.length).startsWith(hint.contextAfter)));
    // An invalid hint is not proof of an occurrence: retain ambiguity.
    if (narrowed.length) candidates = narrowed;
  }
  if (candidates.length !== 1) return { occurrences: candidates.length };
  const start = candidates[0], end = start + hint.quote.length;
  const before = text.slice(Math.max(0, start - 80), start), after = text.slice(end, end + 80);
  return { occurrences: 1, range: { start, end }, ...(before.trim() ? { contextBefore: before } : {}), ...(after.trim() ? { contextAfter: after } : {}) };
}
