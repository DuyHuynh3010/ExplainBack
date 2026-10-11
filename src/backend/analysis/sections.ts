import type { ImportedSource } from "../contracts/domain";
import type { AnalysisDraft } from "./draft";

/** Semantic headings and technical parts are deliberately separate. */
export const SECTION_LIMITS = { partCharacters: 4_000, parts: 6, generations: 8 } as const;
export interface SourcePart {
  id: string; topicId: string; title: string; blockIds: string[];
  topics: { id: string; title: string; blockIds: string[] }[];
}
export interface CompletedPart { partId: string; calls: number; sourceHash: string; draft: AnalysisDraft }
export interface PartProgress { kind: "part_complete"; part: CompletedPart; completed: number; total: number; nextTitle: string }

function heading(text: string, following?: string): string | undefined {
  const lines = text.trim().split(/\r?\n/);
  const first = lines[0].trim();
  const markdown = /^(?:#{1,6}\s+(.+)|\*\*(.+)\*\*)$/.exec(first);
  if (markdown) return (markdown[1] ?? markdown[2]).trim();
  // Plain headings must precede body text, not turn every paragraph into a topic.
  if (first.length <= 100 && first.split(/\s+/).length <= 12 && !/[.!?。？！]$/.test(first) &&
      (lines.slice(1).join(" ").length > 80 || (following?.length ?? 0) > 80)) return first;
}

export function planSourceParts(source: ImportedSource): SourcePart[] {
  const sections: { topicId: string; title: string; blocks: typeof source.document.blocks }[] = [];
  for (const [i, block] of source.document.blocks.entries()) {
    const title = heading(block.text, source.document.blocks[i + 1]?.text);
    if (title || !sections.length) sections.push({ topicId: `section-${sections.length + 1}`, title: title ?? source.document.title ?? "Source overview", blocks: [] });
    sections[sections.length - 1].blocks.push(block);
  }
  const parts: SourcePart[] = [];
  for (const section of sections) {
    let blocks: typeof source.document.blocks = [], size = 0;
    const flush = () => { if (blocks.length) parts.push({ id: `part-${parts.length + 1}`, topicId: section.topicId, title: section.title, blockIds: blocks.map(b => b.id), topics: [{ id: section.topicId, title: section.title, blockIds: blocks.map(b => b.id) }] }); blocks = []; size = 0; };
    for (const b of section.blocks) {
      if (size + b.text.length > SECTION_LIMITS.partCharacters) flush();
      blocks.push(b); size += b.text.length;
    }
    flush();
  }
  // Small adjacent sections can share a generation while retaining separate topics.
  // Keep this packing target below the hard part ceiling to leave JSON headroom.
  const packed: SourcePart[] = [];
  const sizes = new Map(source.document.blocks.map(b => [b.id, b.text.length]));
  const size = (p: SourcePart) => p.blockIds.reduce((n, id) => n + sizes.get(id)!, 0);
  for (const part of parts) {
    const previous = packed.at(-1);
    if (previous && size(previous) + size(part) <= 2_000) {
      previous.blockIds.push(...part.blockIds);
      for (const t of part.topics) {
        const existing = previous.topics.find(k => k.id === t.id);
        if (existing) existing.blockIds.push(...t.blockIds); else previous.topics.push(t);
      }
      previous.title = previous.topics.map(t => t.title).join(" / ");
    } else packed.push({ ...part, id: `part-${packed.length + 1}` });
  }
  return packed;
}
