import { randomUUID } from "node:crypto";
import type { AnalysisWarning, Concept, Evidence, ImportedSource, SourceAnalysis, Statement } from "../contracts/domain";
import { validateSourceAnalysis } from "../contracts/validate";
import type { AnalysisDraft, DraftEvidence } from "./draft";
import { AnalysisError, DraftError } from "./errors";

function fail(message: string): never { throw new DraftError(message); }
function uniqueIds<T extends { id: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item.id) || map.has(item.id)) fail("Draft IDs must be valid and unique within each collection.");
    map.set(item.id, item);
  }
  return map;
}
function reference(map: Map<string, string>, id: string): string {
  return map.get(id) ?? fail("AI output references an unknown entity.");
}

/** A conservative lexical guard for explicit question-only text, not a semantic classifier. */
export function isExplicitQuestionText(text: string): boolean {
  const sentences = text.trim().split(/(?<=[.!?？])\s+|\n+/u).filter(Boolean);
  return sentences.length > 0 && sentences.every(s => /[?？]$/.test(s.trim()));
}

function evidenceSpan(text: string, evidence: DraftEvidence): { start: number; end: number } | undefined {
  const matches: number[] = [];
  for (let start = text.indexOf(evidence.quote); start >= 0; start = text.indexOf(evidence.quote, start + 1)) {
    const end = start + evidence.quote.length;
    if (evidence.contextBefore !== undefined && !text.slice(0, start).endsWith(evidence.contextBefore)) continue;
    if (evidence.contextAfter !== undefined && !text.slice(end).startsWith(evidence.contextAfter)) continue;
    matches.push(start);
  }
  if (!matches.length) fail("Evidence quote or adjacent context does not match the referenced source block.");
  return matches.length === 1 ? { start: matches[0], end: matches[0] + evidence.quote.length } : undefined;
}

export function normalizeAnalysisDraft(source: ImportedSource, draft: AnalysisDraft): SourceAnalysis {
  const blocks = new Map(source.document.blocks.map(b => [b.id, b]));
  const dispositions = new Map<string, AnalysisDraft["blockDispositions"][number]["kind"]>();
  for (const disposition of draft.blockDispositions) {
    if (!blocks.has(disposition.blockId) || dispositions.has(disposition.blockId)) fail("Each source block must have exactly one valid disposition.");
    dispositions.set(disposition.blockId, disposition.kind);
  }
  if (dispositions.size !== blocks.size) fail("AI output must account for every source block without truncating the input.");
  uniqueIds(draft.topics);
  uniqueIds(draft.concepts);
  uniqueIds(draft.statements);
  if (!draft.statements.length) {
    if (draft.topics.length || draft.concepts.length || draft.lessonSections.length || [...dispositions.values()].some(k => k === "knowledge" || k === "mixed")) fail("Empty extraction must have no graph/summary or knowledge dispositions.");
    throw new AnalysisError("NO_EXTRACTABLE_KNOWLEDGE", 422, "Source contains no explicit extractable knowledge. Questions are not solved by this endpoint.");
  }
  const topicIds = new Map(draft.topics.map(t => [t.id, randomUUID()]));
  const conceptIds = new Map<string, string>();
  const conceptKeys = new Map<string, string>();
  const concepts: Concept[] = [];
  for (const concept of draft.concepts) {
    const topicId = reference(topicIds, concept.topicId);
    const aliases = [...new Set(concept.aliases)];
    // Exact structured duplicates only: no fuzzy names, lowercasing, or cross-topic merging.
    const key = JSON.stringify([topicId, concept.name, [...aliases].sort(), concept.symbol]);
    let id = conceptKeys.get(key);
    if (!id) {
      id = randomUUID(); conceptKeys.set(key, id);
      concepts.push({ id, topicId, name: concept.name, aliases, ...(concept.symbol !== undefined ? { symbol: concept.symbol } : {}) });
    }
    conceptIds.set(concept.id, id);
  }
  const conceptMap = new Map(concepts.map(c => [c.id, c]));
  const evidence: Evidence[] = [];
  const evidenceKeys = new Map<string, string>();
  const analysisWarnings: AnalysisWarning[] = [];
  const warningKeys = new Set<string>();
  const warning = (code: AnalysisWarning["code"], blockId: string, message: string) => {
    const key = `${code}:${blockId}`;
    if (!warningKeys.has(key)) { warningKeys.add(key); analysisWarnings.push({ code, blockId, message }); }
  };
  const supportedBlocks = new Set<string>();
  const statementIds = new Map<string, string>();
  const statementKeys = new Map<string, string>();
  const statements: Statement[] = [];
  for (const statement of draft.statements) {
    const topicId = reference(topicIds, statement.topicId);
    const subjectConceptId = reference(conceptIds, statement.subjectConceptId);
    const objectConceptId = reference(conceptIds, statement.objectConceptId);
    if (conceptMap.get(subjectConceptId)!.topicId !== topicId || conceptMap.get(objectConceptId)!.topicId !== topicId) fail("Statements cannot cross topic boundaries.");
    const evidenceIds: string[] = [];
    for (const item of statement.evidence) {
      const block = blocks.get(item.blockId) ?? fail("Evidence references an unknown source block.");
      const disposition = dispositions.get(block.id);
      if (disposition === "questions" || disposition === "other" || isExplicitQuestionText(block.text) || isExplicitQuestionText(item.quote)) fail("Questions or unsupported source blocks cannot establish a knowledge assertion.");
      const charRange = evidenceSpan(block.text, item);
      supportedBlocks.add(block.id);
      if (!charRange) warning("AMBIGUOUS_EVIDENCE", block.id, "Repeated quote has no unique source position; evidence remains unverified.");
      const key = JSON.stringify([block.id, item.quote, charRange]);
      let id = evidenceKeys.get(key);
      if (!id) {
        id = randomUUID(); evidenceKeys.set(key, id);
        evidence.push({ id, documentId: source.document.id, blockId: block.id, quote: item.quote,
          kind: "source_quote", verification: charRange ? "verified" : "unverified",
          ...(charRange || block.location?.page !== undefined ? { location: { ...(charRange ? { charRange } : {}), ...(block.location?.page !== undefined ? { page: block.location.page } : {}) } } : {}),
        });
      }
      if (!evidenceIds.includes(id)) evidenceIds.push(id);
    }
    const content = { topicId, subjectConceptId, relation: statement.relation, objectConceptId,
      assertion: statement.assertion, negated: statement.negated, conditions: statement.conditions,
      ...(statement.formula !== undefined ? { formula: statement.formula } : {}), role: statement.role, evidenceIds };
    const key = JSON.stringify({ ...content, evidenceIds: [...evidenceIds].sort() });
    let id = statementKeys.get(key);
    if (!id) { id = randomUUID(); statementKeys.set(key, id); statements.push({ id, ...content }); }
    statementIds.set(statement.id, id);
  }
  for (const [blockId, kind] of dispositions) {
    if ((kind === "knowledge" || kind === "mixed") && !supportedBlocks.has(blockId)) fail("A knowledge block was classified but has no extracted supporting statement.");
    if (kind === "questions" || kind === "mixed") warning("QUESTIONS_PRESENT", blockId, "Source contains questions or exercises; no inferred answers were added.");
  }
  const sectionTopics = new Set<string>();
  const lessonSections = draft.lessonSections.map(section => {
    const topicId = reference(topicIds, section.topicId);
    if (sectionTopics.has(topicId)) fail("Each topic requires exactly one lesson section.");
    sectionTopics.add(topicId);
    return { id: randomUUID(), topicId, summary: section.summary,
      statementIds: [...new Set(section.statementIds.map(id => reference(statementIds, id)))],
      keyPoints: section.keyPoints.map(p => ({ id: randomUUID(), text: p.text, statementIds: [...new Set(p.statementIds.map(id => reference(statementIds, id)))] })),
    };
  });
  for (const topicId of topicIds.values()) {
    if (!statements.some(s => s.topicId === topicId)) fail("Each extracted topic requires a supported statement.");
  }
  const result: SourceAnalysis = {
    schemaVersion: "1.0", id: randomUUID(), provenance: "analysis", document: structuredClone(source.document),
    graph: { id: randomUUID(), documentId: source.document.id, kind: "source",
      topics: draft.topics.map(t => ({ id: reference(topicIds, t.id), title: t.title })), concepts, statements, evidence },
    lessonSections, sourceWarnings: structuredClone(source.warnings), analysisWarnings,
  };
  if (!validateSourceAnalysis(result).valid) fail("Normalized analysis failed the domain contract (references, evidence or lesson links).");
  return result;
}
