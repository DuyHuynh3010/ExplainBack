/** Synthetic transport fixtures for browser mechanics, not model accuracy. */
import type { ImportedSource } from "../src/backend/contracts/domain";
import { normalizeAnalysisDraft } from "../src/backend/analysis/normalize";
import type { AnalysisDraft } from "../src/backend/analysis/draft";

export function mockAnalysis(source: ImportedSource) {
  const blocks = source.document.blocks;
  const draft: AnalysisDraft = {
    blockDispositions: blocks.map(b => ({ blockId: b.id, kind: "knowledge" })),
    topics: [{ id: "energy", title: "Energy" }, { id: "light", title: "Light" }],
    concepts: [
      { id: "a", name: "Glucose", aliases: [] },
      { id: "b", name: "Energy", aliases: [], symbol: "E" },
      { id: "c", name: "Chlorophyll", aliases: [] },
      { id: "d", name: "Light", aliases: [] },
    ],
    statements: blocks.map((b, i) => ({
      id: `s${i}`, topicId: "energy", representation: { kind: "binary", subjectConceptId: "a", objectConceptId: "b", relation: `stores ${i + 1}` },
      assertion: `Synthetic source assertion ${i + 1}`, negated: false, conditions: [], role: "fact",
      evidence: [{ blockId: b.id, quote: b.text.includes("Glucose stores energy. Glucose stores energy.") ? "Glucose stores energy." : b.text }],
    })),
    lessonSections: [],
  };
  draft.statements.push(
    { ...draft.statements[0], id: "parallel", representation: { kind: "binary", subjectConceptId: "a", objectConceptId: "b", relation: "retains" }, assertion: "Synthetic parallel assertion", negated: true, conditions: ["Under the stated source condition"] },
    { ...draft.statements[0], id: "reverse", representation: { kind: "binary", subjectConceptId: "b", objectConceptId: "a", relation: "returns to" }, assertion: "Synthetic reverse assertion" },
    { ...draft.statements[0], id: "light-s", topicId: "light", representation: { kind: "binary", subjectConceptId: "c", objectConceptId: "d", relation: "absorbs" }, assertion: "Synthetic light assertion" },
  );
  draft.lessonSections = draft.topics.map(t => {
    const ids = draft.statements.filter(s => s.topicId === t.id).map(s => s.id);
    return { topicId: t.id, summary: `Synthetic ${t.title.toLowerCase()} summary from the transport mock.`, statementIds: ids,
      keyPoints: [{ text: `${t.title} key point from the mock.`, statementIds: [ids[0]] }] };
  });
  return normalizeAnalysisDraft(source, draft);
}
