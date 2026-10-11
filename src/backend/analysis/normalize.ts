import { randomUUID } from "node:crypto";
import type { AnalysisWarning, Concept, Evidence, ImportedSource, SourceAnalysis, Statement } from "../contracts/domain";
import { validateSourceAnalysis } from "../contracts/validate";
import { locateQuote } from "./evidence";
import { referencedConceptIds, remapRepresentation } from "../contracts/graph";
import { inspectStatement, inspectRepeatedAssertions } from "../contracts/statement-quality";
import { ANALYSIS_LIMITS } from "./limits";
import type { AnalysisDraft } from "./draft";
import { AnalysisError, DraftError, type DraftIssue } from "./errors";
import { checkDraftReferences } from "./draft-references";
import { reviewExtraction } from "./review";
import { canonicalConcepts, resolveDraftConcepts } from "./concept-catalog";
export { canonicalConcepts } from "./concept-catalog";

function fail(message: string, path = "$", code: DraftIssue["code"] = "invariant", ids?: Record<string, string>): never { throw new DraftError(message, [{ path, code, message, ...(ids ? { ids } : {}) }]); }
function uniqueIds<T extends { id: string }>(items: T[], path: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const [index, item] of items.entries()) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item.id) || map.has(item.id)) fail("Draft IDs must be valid and unique within each collection.", `${path}[${index}].id`, "invariant", { entityId: item.id });
    map.set(item.id, item);
  }
  return map;
}
function reference(map: Map<string, string>, id: string): string {
  return map.get(id) ?? fail("AI output references an unknown entity.", "$", "reference", { referencedId: id });
}

/** A conservative lexical guard for explicit question-only text, not a semantic classifier. */
export function isExplicitQuestionText(text: string): boolean {
  const sentences = text.trim().split(/(?<=[.!?？])\s+|\n+/u).filter(Boolean);
  return sentences.length > 0 && sentences.every(s => /[?？]$/.test(s.trim()));
}

/** Canonical draft ID is identity. Distinct IDs remain distinct even with identical labels. */
export function normalizeAnalysisDraft(source: ImportedSource, draft: AnalysisDraft, observe?: (candidate: SourceAnalysis) => void): SourceAnalysis {
  draft = resolveDraftConcepts(draft);
  const blocks = new Map(source.document.blocks.map(b => [b.id, b]));
  const dispositions = new Map<string, AnalysisDraft["blockDispositions"][number]["kind"]>();
  for (const [i, disposition] of draft.blockDispositions.entries()) {
    if (!blocks.has(disposition.blockId) || dispositions.has(disposition.blockId)) fail("Each source block must have exactly one valid disposition.", `$.blockDispositions[${i}].blockId`, "reference", { blockId: disposition.blockId });
    dispositions.set(disposition.blockId, disposition.kind);
  }
  if (dispositions.size !== blocks.size) fail("AI output must account for every source block without truncating the input.", "$.blockDispositions");
  uniqueIds(draft.topics, "$.topics");
  uniqueIds(draft.concepts, "$.concepts");
  uniqueIds(draft.statements, "$.statements");
  checkDraftReferences(draft);
  if (!draft.statements.length) {
    if (draft.topics.length || draft.concepts.length || draft.lessonSections.length || [...dispositions.values()].some(k => k === "knowledge" || k === "mixed")) fail("Empty extraction must have no graph/summary or knowledge dispositions.");
    throw new AnalysisError("NO_EXTRACTABLE_KNOWLEDGE", 422, "Source contains no explicit extractable knowledge. Questions are not solved by this endpoint.");
  }
  const topicIds = new Map(draft.topics.map(t => [t.id, randomUUID()]));
  const conceptIds = new Map<string, string>();
  const concepts: Concept[] = draft.concepts.map(concept => {
    const id = randomUUID(); conceptIds.set(concept.id, id);
    return { id, documentId: source.document.id, name: concept.name, aliases: [...new Set(concept.aliases)], ...(concept.symbol ? { symbol: concept.symbol } : {}) };
  });
  const quality = [...draft.statements.flatMap((statement, i) => inspectStatement(statement, draft.concepts, `$.statements[${i}]`)),
    ...inspectRepeatedAssertions(draft.statements, draft.concepts, "$.statements")];
  const semanticErrors = quality.filter(i => i.severity === "error").map(({ severity: _severity, ...issue }) => issue);
  if (semanticErrors.length) throw new DraftError("Extraction contains inconsistent assertion/representation data; review the reported statements.", semanticErrors);
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
  for (const [statementIndex, statement] of draft.statements.entries()) {
    const topicId = reference(topicIds, statement.topicId);
    const r = statement.representation;
    const representation = remapRepresentation(r, id => reference(conceptIds, id));
    const evidenceIds: string[] = [];
    for (const [evidenceIndex, item] of statement.evidence.entries()) {
      const path = `$.statements[${statementIndex}].evidence[${evidenceIndex}]`;
      const block = blocks.get(item.blockId) ?? fail("Evidence references an unknown source block.", `${path}.blockId`, "reference", { blockId: item.blockId, statementId: statement.id });
      const disposition = dispositions.get(block.id);
      if (disposition === "questions" || disposition === "other" || isExplicitQuestionText(block.text) || isExplicitQuestionText(item.quote)) fail("Questions or unsupported source blocks cannot establish a knowledge assertion.", path, "evidence", { blockId: item.blockId, statementId: statement.id });
      const located = locateQuote(block.text, item);
      if (!located.occurrences) fail("Evidence quote is absent from its referenced block.", `${path}.quote`, "evidence", { blockId: item.blockId, statementId: statement.id });
      const charRange = located.range;
      supportedBlocks.add(block.id);
      if (!charRange) warning("AMBIGUOUS_EVIDENCE", block.id, "Repeated quote has no unique source position; evidence remains unverified.");
      const key = JSON.stringify([block.id, item.quote, charRange]);
      let id = evidenceKeys.get(key);
      if (!id) {
        id = randomUUID(); evidenceKeys.set(key, id);
        evidence.push({ id, documentId: source.document.id, blockId: block.id, quote: item.quote,
          kind: "source_quote", verification: charRange ? "verified" : "unverified",
          ...(located.contextBefore ? { contextBefore: located.contextBefore } : {}), ...(located.contextAfter ? { contextAfter: located.contextAfter } : {}),
          ...(charRange || block.location?.page !== undefined ? { location: { ...(charRange ? { charRange } : {}), ...(block.location?.page !== undefined ? { page: block.location.page } : {}) } } : {}),
        });
      }
      if (!evidenceIds.includes(id)) evidenceIds.push(id);
    }
    const content = { topicId, representation,
      assertion: statement.assertion, negated: statement.negated, conditions: statement.conditions,
      ...(statement.formula !== undefined ? { formula: statement.formula } : {}), role: statement.role, evidenceIds };
    const key = JSON.stringify({ ...content, evidenceIds: [...evidenceIds].sort() });
    let id = statementKeys.get(key);
    if (!id) { id = randomUUID(); statementKeys.set(key, id); statements.push({ id, ...content }); }
    statementIds.set(statement.id, id);
  }
  for (const [blockId, kind] of dispositions) {
    if ((kind === "knowledge" || kind === "mixed") && !supportedBlocks.has(blockId)) fail("A knowledge block was classified but has no extracted supporting statement.", "$.blockDispositions", "invariant", { blockId });
    if (kind === "questions" || kind === "mixed") warning("QUESTIONS_PRESENT", blockId, "Source contains questions or exercises; no inferred answers were added.");
  }
  const sectionTopics = new Set<string>();
  const lessonSections = draft.lessonSections.map((section, sectionIndex) => {
    const topicId = reference(topicIds, section.topicId);
    if (sectionTopics.has(topicId)) fail("Each topic requires exactly one lesson section.", `$.lessonSections[${sectionIndex}].topicId`, "invariant", { topicId: section.topicId });
    sectionTopics.add(topicId);
    return { id: randomUUID(), topicId, summary: section.summary,
      statementIds: [...new Set(section.statementIds.map(id => reference(statementIds, id)))],
      keyPoints: section.keyPoints.map(p => ({ id: randomUUID(), text: p.text, statementIds: [...new Set(p.statementIds.map(id => reference(statementIds, id)))] })),
    };
  });
  for (const topicId of topicIds.values()) {
    if (!statements.some(s => s.topicId === topicId)) fail("Each extracted topic requires a supported statement.", "$.topics", "invariant", { topicId });
  }
  for (const finding of quality.filter(i => i.severity === "review")) {
    analysisWarnings.push({ code: "EXTRACTION_REVIEW", statementId: reference(statementIds, finding.ids.statementId), message: finding.message });
  }
  for (const { warning, draftStatementId } of reviewExtraction(source, draft)) {
    analysisWarnings.push({ ...warning, ...(draftStatementId ? { statementId: reference(statementIds, draftStatementId) } : {}) });
  }
  const usedConcepts = new Set(statements.flatMap(s => referencedConceptIds(s.representation)));
  for (const c of concepts) if (!usedConcepts.has(c.id)) analysisWarnings.push({ code: "UNUSED_CONCEPT", conceptId: c.id, message: "An extracted concept has no statement. Structural block coverage does not prove complete knowledge coverage." });
  if (draft.topics.length === ANALYSIS_LIMITS.topics || draft.concepts.length === ANALYSIS_LIMITS.concepts || draft.statements.length === ANALYSIS_LIMITS.statements) analysisWarnings.push({ code: "COVERAGE_LIMIT", message: "Extraction reached a configured collection limit. Source was preserved; knowledge coverage may be incomplete." });
  const blockOrder = new Map(source.document.blocks.map((b, i) => [b.id, i]));
  const position = (topicId: string): [number, number] => {
    const spans = statements.filter(s => s.topicId === topicId).flatMap(s => s.evidenceIds.map(id => evidence.find(e => e.id === id)!)).map(e => [blockOrder.get(e.blockId)!, e.location?.charRange?.start ?? Number.MAX_SAFE_INTEGER] as [number, number]);
    return spans.sort((a, b) => a[0] - b[0] || a[1] - b[1])[0] ?? [Infinity, Infinity];
  };
  const topics = draft.topics.map((t, index) => ({ id: reference(topicIds, t.id), title: t.title, index })).sort((a, b) => {
    const x = position(a.id), y = position(b.id);
    return (x[0] - y[0] || x[1] - y[1] || a.index - b.index);
  }).map(({ index: _index, ...topic }) => topic);
  lessonSections.sort((a, b) => topics.findIndex(t => t.id === a.topicId) - topics.findIndex(t => t.id === b.topicId));
  const result: SourceAnalysis = {
    schemaVersion: "2.0", id: randomUUID(), provenance: "analysis", document: structuredClone(source.document),
    graph: { id: randomUUID(), documentId: source.document.id, kind: "source",
      topics, concepts, statements, evidence },
    lessonSections, sourceWarnings: structuredClone(source.warnings), analysisWarnings,
  };
  observe?.(result);
  const validation = validateSourceAnalysis(result);
  if (!validation.valid) throw new DraftError("Normalized analysis failed the domain contract (references, evidence or lesson links).", validation.issues);
  return result;
}
