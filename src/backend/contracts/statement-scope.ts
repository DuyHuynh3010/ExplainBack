import type { Concept } from "./domain";

type NamedConcept = Pick<Concept, "name" | "aliases">;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Literal English scope phrases bound to known concept names, not entailment.
 * This only exposes existing text; it never changes a claim or creates a concept. */
export function explicitScopes(text: string, concepts: NamedConcept[]): string[] {
  const names = [...new Set(concepts.flatMap(c => [c.name, ...c.aliases])
    .map(n => n.replace(/^(?:the|an?)\s+/i, "").trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!names.length) return [];
  const pattern = new RegExp(`\\b((?:some types of|not all|some|most|only|all|no)\\s+(?:${names.map(escape).join("|")}))(?=$|[\\s.,;:()])`, "gi");
  return [...new Set([...text.matchAll(pattern)].map(m => m[1]))];
}
