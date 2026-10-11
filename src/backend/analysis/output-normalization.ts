import { createHash } from "node:crypto";
import type { AnalysisDraft } from "./draft";
import type { EvaluationDraft } from "../explanations/evaluation";
import type { EvaluateTextRequest } from "../contracts/api";
import type { Evidence, ImportedSource, SourceAnalysis, EvaluationResult, StatementRepresentation, EvaluationStatus } from "../contracts/domain";
import { AnalysisError, type DraftIssue } from "./errors";
import { locateQuote } from "./evidence";
import { referencedConceptIds } from "../contracts/graph";

type RecordValue = Record<string, unknown>;
export const record = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const rows = (v: unknown): RecordValue[] => Array.isArray(v) ? v.filter(x => x && typeof x === "object" && !Array.isArray(x)).map(record) : [];
const str = (v: unknown): string => typeof v === "string" ? v : "";
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const unique = <T>(v: T[]): T[] => [...new Set(v)];
const claimRows = (v: unknown) => rows(v).filter(c => !!str(c.assertion).trim() || !!str(c.formula).trim() || !!str(record(c.representation).relation).trim() || !!str(c.quote).trim());
const graphFields = ["topics", "concepts", "statements", "claims", "comparisons", "additionalIdeas", "lessonSections"];
const hasGraphData = (v: RecordValue) => graphFields.some(k => Object.prototype.hasOwnProperty.call(v, k));
export const outputId = (scope: string, kind: string, key: string): string => `${kind}:${createHash("sha256").update(JSON.stringify([scope, kind, key])).digest("hex").slice(0, 32)}`;

/** Recover only readable JSON values, including complete fields/items before a
 * damaged tail. Never finish a truncated string or manufacture a claim/quote.
 */
export function readOutputObject(raw: string): RecordValue {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value) && hasGraphData(value)) return value;
  } catch { /* Inspect the readable object prefix below. */ }
  const start = raw.indexOf("{");
  if (start < 0) throw new AnalysisError("AI_OUTPUT_INVALID", 502, "AI returned no readable graph data.");
  let at = start;
  const space = () => { while (/\s/.test(raw[at] ?? "") && at < raw.length) at++; };
  type Parsed = { value: unknown; complete: boolean; readable: boolean };
  const parse = (depth: number): Parsed => {
    space();
    if (depth > 80) return { value: undefined, complete: false, readable: false };
    const token = raw[at];
    if (token === '"') {
      const begin = at++;
      while (at < raw.length) {
        if (raw[at] === "\\") { at += 2; continue; }
        if (raw[at++] === '"') {
          try { return { value: JSON.parse(raw.slice(begin, at)), complete: true, readable: true }; } catch { break; }
        }
      }
      return { value: undefined, complete: false, readable: false };
    }
    if (token === "{" || token === "[") {
      at++;
      const array = token === "[", close = array ? "]" : "}";
      const value: unknown[] | RecordValue = array ? [] : Object.create(null);
      let count = 0;
      while (at < raw.length) {
        space();
        if (raw[at] === close) { at++; return { value, complete: true, readable: true }; }
        let key = "";
        if (!array) {
          const name = parse(depth + 1); space();
          if (!name.complete || typeof name.value !== "string" || raw[at++] !== ":") break;
          key = name.value;
        }
        const item = parse(depth + 1);
        if (item.readable) {
          if (array) (value as unknown[]).push(item.value);
          else (value as RecordValue)[key] = item.value;
          count++;
        }
        if (!item.complete) break;
        space();
        if (raw[at] === close) { at++; return { value, complete: true, readable: true }; }
        if (raw[at++] !== ",") break;
      }
      return { value, complete: false, readable: count > 0 };
    }
    const match = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|[,}\]]|$)/.exec(raw.slice(at));
    if (match) { at += match[0].length; return { value: JSON.parse(match[0]), complete: true, readable: true }; }
    return { value: undefined, complete: false, readable: false };
  };
  const parsed = parse(0), value = record(parsed.value);
  if (!parsed.readable || !hasGraphData(value)) throw new AnalysisError("AI_OUTPUT_INVALID", 502, "AI returned no readable graph data.");
  return value;
}

/** Ambiguous duplicate IDs resolve to the first explicit record, never by label.
 * Later records receive separate stable IDs so their content is not overwritten.
 */
function identify(input: RecordValue[], prefix: string, reserved: string[] = []) {
  const used = new Set(reserved), refs = new Map<string, string>();
  const values: (RecordValue & { id: string })[] = input.map((r, i) => {
    const old = str(r.id);
    let id = old && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(old) && !used.has(old) ? old : outputId(prefix, "id", `${i}:${old}`);
    while (used.has(id)) id += ":next";
    used.add(id); if (old && !refs.has(old)) refs.set(old, id);
    return { ...r, id };
  });
  return { values, refs };
}

function representations(raw: unknown, resolve: (id: string) => string | undefined): StatementRepresentation {
  const r = record(raw);
  const subject = resolve(str(r.subjectConceptId)), object = resolve(str(r.objectConceptId));
  if (r.kind === "binary" && subject && object && str(r.relation).trim())
    return { kind: "binary", subjectConceptId: subject, relation: str(r.relation), objectConceptId: object };
  const participants = r.kind === "binary"
    ? [{ conceptId: subject, role: "subject" }, { conceptId: object, role: "object" }]
    : rows(r.participants).map(p => ({ conceptId: resolve(str(p.conceptId)), role: str(p.role) }));
  return { kind: "complex", participants: participants.filter((p): p is { conceptId: string; role: string } => !!p.conceptId && !!p.role.trim()) };
}

/** Canonicalizes shape and IDs, retaining AI content independently of quality. */
export function readableAnalysisDraft(input: unknown, catalog: AnalysisDraft["concepts"] = []): AnalysisDraft {
  const raw = record(input);
  const topics = identify(rows(raw.topics), "topics"), claims = identify(claimRows(raw.statements), "statements");
  const local = identify(rows(raw.concepts), "concepts", catalog.map(c => c.id));
  const conceptRefs = new Map([...local.refs, ...catalog.map(c => [c.id, c.id] as const)]);
  const concepts = [...catalog.map(c => structuredClone(c)), ...local.values.filter(c => {
    const original = str(rows(raw.concepts)[local.values.indexOf(c)]?.id);
    const known = catalog.find(k => k.id === original);
    return !known || known.name !== str(c.name) || known.symbol !== c.symbol;
  }).map(c => ({ id: c.id, name: str(c.name), aliases: unique(strings(c.aliases)), ...(str(c.symbol) ? { symbol: str(c.symbol) } : {}) }))];
  const normalizedTopics = topics.values.map(t => ({ id: t.id, title: str(t.title) }));
  const topicRef = (id: unknown) => {
    const key = str(id), existing = topics.refs.get(key);
    if (existing) return existing;
    const next = outputId("topics", "topic", key);
    if (!normalizedTopics.some(t => t.id === next)) normalizedTopics.push({ id: next, title: key || "Lesson" });
    return next;
  };
  if (!normalizedTopics.length) topicRef("");
  return {
    topics: normalizedTopics, concepts,
    blockDispositions: rows(raw.blockDispositions).map(b => ({ blockId: str(b.blockId), kind: ["knowledge", "questions", "mixed", "other"].includes(str(b.kind)) ? b.kind as AnalysisDraft["blockDispositions"][number]["kind"] : "other" })),
    statements: claims.values.map(c => ({ id: c.id, topicId: topicRef(c.topicId),
      representation: representations(c.representation, id => conceptRefs.get(id)),
      assertion: str(c.assertion) || str(c.formula), negated: c.negated === true || c.negated === "true", conditions: strings(c.conditions),
      ...(str(c.formula) ? { formula: str(c.formula) } : {}),
      role: ["definition", "fact", "mechanism", "formula", "example"].includes(str(c.role)) ? c.role as AnalysisDraft["statements"][number]["role"] : "fact",
      evidence: rows(c.evidence).map(e => ({ blockId: str(e.blockId), quote: str(e.quote), ...(str(e.contextBefore) ? { contextBefore: str(e.contextBefore) } : {}), ...(str(e.contextAfter) ? { contextAfter: str(e.contextAfter) } : {}) })),
    })),
    lessonSections: rows(raw.lessonSections).map(l => ({ topicId: topicRef(l.topicId), summary: str(l.summary),
      statementIds: unique(strings(l.statementIds).flatMap(id => claims.refs.has(id) ? [claims.refs.get(id)!] : [])),
      keyPoints: rows(l.keyPoints).map(p => ({ text: str(p.text), statementIds: unique(strings(p.statementIds).flatMap(id => claims.refs.has(id) ? [claims.refs.get(id)!] : [])) })),
    })),
  };
}

function groundedEvidence(scope: string, key: string, document: ImportedSource["document"], item: RecordValue, kind: Evidence["kind"]): Evidence {
  const blockId = str(item.blockId) || outputId(scope, "unlocated", key);
  const block = document.blocks.find(b => b.id === blockId), quote = str(item.quote);
  const located = block ? locateQuote(block.text, { quote, contextBefore: str(item.contextBefore), contextAfter: str(item.contextAfter) }) : { occurrences: 0 };
  return { id: outputId(scope, "evidence", key), documentId: document.id, blockId, quote, kind,
    verification: located.range ? "verified" : "unverified",
    ...(located.contextBefore ? { contextBefore: located.contextBefore } : {}), ...(located.contextAfter ? { contextAfter: located.contextAfter } : {}),
    ...(located.range || block?.location?.page !== undefined ? { location: {
      ...(located.range ? { charRange: located.range } : {}), ...(block?.location?.page !== undefined ? { page: block.location.page } : {}),
    } } : {}),
  };
}

export function sourceOutput(source: ImportedSource, input: unknown): SourceAnalysis {
  const draft = readableAnalysisDraft(input), scope = source.document.id;
  const topicId = (id: string) => outputId(scope, "topic", id), conceptId = (id: string) => outputId(scope, "concept", id), statementId = (id: string) => outputId(scope, "statement", id);
  const evidence: Evidence[] = [];
  const statements = draft.statements.map(s => {
    const es = s.evidence.map((e, i) => groundedEvidence(scope, `${s.id}:${i}`, source.document, e as unknown as RecordValue, "source_quote"));
    evidence.push(...es);
    const r = s.representation;
    return { id: statementId(s.id), topicId: topicId(s.topicId), assertion: s.assertion, negated: s.negated, conditions: s.conditions, role: s.role,
      ...(s.formula !== undefined ? { formula: s.formula } : {}), evidenceIds: es.map(e => e.id),
      representation: r.kind === "binary" ? { ...r, subjectConceptId: conceptId(r.subjectConceptId), objectConceptId: conceptId(r.objectConceptId) }
        : { kind: "complex" as const, participants: r.participants.map(p => ({ ...p, conceptId: conceptId(p.conceptId) })) },
    };
  });
  const blockOrder = new Map(source.document.blocks.map((b, i) => [b.id, i]));
  const firstEvidence = (id: string): number[] => statements.filter(s => s.topicId === id).flatMap(s =>
    s.evidenceIds.flatMap(id => {
      const e = evidence.find(e => e.id === id);
      return e && blockOrder.has(e.blockId) ? [[blockOrder.get(e.blockId)!, e.location?.charRange?.start ?? 0]] : [];
    })).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0] ?? [Infinity, Infinity];
  const topics = draft.topics.map((t, index) => ({ ...t, id: topicId(t.id), index })).sort((a, b) => {
    const x = firstEvidence(a.id), y = firstEvidence(b.id);
    return x[0] - y[0] || x[1] - y[1] || a.index - b.index;
  }).map(({ index: _index, ...t }) => t);
  return { schemaVersion: "2.0", id: outputId(scope, "analysis", JSON.stringify(draft)), provenance: "analysis", document: structuredClone(source.document),
    graph: { id: outputId(scope, "graph", "source"), documentId: scope, kind: "source", topics,
      concepts: draft.concepts.map(c => ({ ...c, id: conceptId(c.id), documentId: scope })), statements, evidence },
    lessonSections: draft.lessonSections.map((l, i) => ({ ...l, id: outputId(scope, "lesson", String(i)), topicId: topicId(l.topicId),
      statementIds: l.statementIds.map(statementId), keyPoints: l.keyPoints.map((p, j) => ({ ...p, id: outputId(scope, "point", `${i}:${j}`), statementIds: p.statementIds.map(statementId) })) }))
      .sort((a, b) => topics.findIndex(t => t.id === a.topicId) - topics.findIndex(t => t.id === b.topicId)),
    sourceWarnings: structuredClone(source.warnings), analysisWarnings: [],
  };
}

export function readableEvaluationDraft(value: unknown): EvaluationDraft {
  const raw = record(value), claims = identify(claimRows(raw.claims), "claims");
  const conceptRefs = identify(rows(raw.concepts), "concepts").refs;
  const shape = readableAnalysisDraft({ concepts: raw.concepts, statements: claims.values.map(c => ({ ...c, topicId: "explanation", evidence: [] })) });
  return { concepts: shape.concepts, claims: shape.statements.map((s, i) => ({ ...s, quote: str(claims.values[i].quote),
    ...(str(claims.values[i].contextBefore) ? { contextBefore: str(claims.values[i].contextBefore) } : {}), ...(str(claims.values[i].contextAfter) ? { contextAfter: str(claims.values[i].contextAfter) } : {}) })),
    comparisons: rows(raw.comparisons).map(c => ({ referenceRelationshipId: str(c.referenceRelationshipId), status: str(c.status) as EvaluationStatus,
      learnerClaimIds: unique(strings(c.learnerClaimIds).flatMap(id => claims.refs.has(id) ? [claims.refs.get(id)!] : [])), explanation: str(c.explanation), suggestions: strings(c.suggestions) })),
    additionalIdeas: rows(raw.additionalIdeas).map(a => ({ learnerClaimIds: unique(strings(a.learnerClaimIds).flatMap(id => claims.refs.has(id) ? [claims.refs.get(id)!] : [])), explanation: str(a.explanation) })),
    conceptAlignments: rows(raw.conceptAlignments).map(a => ({ learnerConceptId: conceptRefs.get(str(a.learnerConceptId)) ?? str(a.learnerConceptId), referenceConceptId: str(a.referenceConceptId), status: str(a.status) as "matched" | "uncertain", explanation: str(a.explanation) })),
  };
}

export function evaluationOutput(input: EvaluateTextRequest, draft: EvaluationDraft, onRemoved?: (issues: DraftIssue[]) => void): EvaluationResult {
  const scope = outputId(input.sourceAnalysis.id, "attempt", input.learner.text);
  const documentId = outputId(scope, "document", "learner"), blockId = outputId(scope, "block", "learner"), topicId = outputId(scope, "topic", "explanation");
  const learnerDocument = { id: documentId, kind: "text" as const, blocks: [{ id: blockId, documentId, text: input.learner.text }] };
  const source = sourceOutput({ schemaVersion: "2.0", document: learnerDocument, warnings: [] } as unknown as ImportedSource,
    { concepts: draft.concepts, topics: [{ id: "explanation", title: "Explanation" }], statements: draft.claims.map(c => ({ ...c, topicId: "explanation", evidence: c.quote ? [{ ...c, blockId }] : [] })) });
  const graph = { ...source.graph, kind: "learner" as const, topics: [{ id: topicId, title: "Explanation" }], statements: source.graph.statements.map(s => ({ ...s, topicId })), evidence: source.graph.evidence.map(e => ({ ...e, kind: "learner_quote" as const })) };
  const claimIds = new Map(draft.claims.map((c, i) => [c.id, graph.statements[i].id]));
  const conceptIds = new Map(draft.concepts.map((c, i) => [c.id, graph.concepts[i].id]));
  const refs = (ids: string[]) => unique(ids).flatMap(id => claimIds.has(id) ? [{ graphId: graph.id, statementId: claimIds.get(id)! }] : []);
  const seen = new Set<string>();
  const comparisons = draft.comparisons.flatMap((c, i) => {
    const s = input.sourceAnalysis.graph.statements.find(s => s.id === c.referenceRelationshipId && input.topicIds.includes(s.topicId));
    if (!s || seen.has(s.id) || !["correct", "partial", "missing", "contradicted", "uncertain"].includes(c.status)) return [];
    const learnerStatements = refs(c.learnerClaimIds);
    // A vanished counterpart cannot support a definite verdict. Keep its claim
    // elsewhere, and the source statement remains Not compared on the canvas.
    if (!["missing", "uncertain"].includes(c.status) && !learnerStatements.length) return [];
    seen.add(s.id);
    return [{ id: outputId(scope, "comparison", `${i}:${s.id}`), referenceRelationshipId: s.id, topicId: s.topicId,
      sourceStatements: [{ graphId: input.sourceAnalysis.graph.id, statementId: s.id }], learnerStatements,
      status: c.status, explanation: c.explanation, suggestions: c.suggestions }];
  });
  const matched = new Set(comparisons.flatMap(c => c.learnerStatements.map(r => r.statementId)));
  const additionalIds = new Set<string>();
  const additionalIdeas = draft.additionalIdeas.flatMap((a, i) => {
    const learnerStatements = refs(a.learnerClaimIds).filter(r => !matched.has(r.statementId) && !additionalIds.has(r.statementId));
    learnerStatements.forEach(r => additionalIds.add(r.statementId));
    return learnerStatements.length ? [{ id: outputId(scope, "additional", String(i)), learnerStatements, explanation: a.explanation }] : [];
  });
  const aligned = new Set<string>();
  const conceptAlignments = (draft.conceptAlignments ?? []).flatMap((a, i) => {
    const learnerConceptId = conceptIds.get(a.learnerConceptId);
    const remove = (ruleId: string) => {
      onRemoved?.([{ path: `$.data.conceptAlignments[${i}]`, code: "reference", ruleId,
        message: "Optional concept mapping cannot be used.", ids: { learnerConceptId: learnerConceptId ?? a.learnerConceptId, referenceConceptId: a.referenceConceptId } }]);
      return [];
    };
    if (!learnerConceptId || aligned.has(learnerConceptId) || !["matched", "uncertain"].includes(a.status) || !input.sourceAnalysis.graph.concepts.some(c => c.id === a.referenceConceptId)) return remove("unknown_alignment_concept");
    const supported = comparisons.some(c => {
      const reference = input.sourceAnalysis.graph.statements.find(s => s.id === c.referenceRelationshipId)!;
      return referencedConceptIds(reference.representation).includes(a.referenceConceptId) && c.learnerStatements.some(r => referencedConceptIds(graph.statements.find(s => s.id === r.statementId)!.representation).includes(learnerConceptId));
    });
    if (!supported) return remove("unsupported_concept_alignment");
    aligned.add(learnerConceptId); return [{ ...a, learnerConceptId }];
  });
  return { schemaVersion: "2.0", id: outputId(scope, "evaluation", JSON.stringify(draft)), provenance: input.sourceAnalysis.provenance,
    sourceAnalysisId: input.sourceAnalysis.id, topicIds: unique(input.topicIds), learnerDocument, learnerGraph: graph, comparisons, additionalIdeas, conceptAlignments };
}
