import { referencedConceptIds } from "./graph";
import { inspectStatement, inspectRepeatedAssertions } from "./statement-quality";
import type {
  Document, EvaluationResult, ExplainBackDemo, ImportedSource, KnowledgeGraph, SourceAnalysis,
  StatementRef,
} from "./domain";
import type { AnalyzeImportedSourceRequest, AnalyzeSourceRequest, AnalyzeSourceResponse, EvaluateTextRequest, EvaluateTextResponse } from "./api";

export interface ValidationIssue {
  path: string;
  code: "shape" | "reference" | "invariant" | "evidence";
  message: string;
  /** Internal diagnostic labels, never source text or provider messages. */
  ruleId?: string;
  ids?: Record<string, string>;
  catalogFound?: boolean;
}
export type ValidationResult<T> =
  | { valid: true; value: T; issues: [] }
  | { valid: false; issues: ValidationIssue[] };

// Small dependency-free runtime schema. Unknown fields are rejected to catch drift.
type Rule = { optional?: boolean } & (
  | { type: "string"; values?: string[]; id?: boolean; allowEmpty?: boolean }
  | { type: "union"; options: Rule[] }
  | { type: "boolean" }
  | { type: "integer"; min: number }
  | { type: "array"; item: Rule; min: number; max?: number }
  | { type: "object"; fields: Record<string, Rule> }
);
const string = (values?: string[]): Rule => ({ type: "string", values });
const id: Rule = { type: "string", id: true };
const optional = (rule: Rule): Rule => ({ ...rule, optional: true });
const array = (item: Rule, min = 0, max?: number): Rule => ({ type: "array", item, min, max });
const object = (fields: Record<string, Rule>): Rule => ({ type: "object", fields });
const page: Rule = { type: "integer", min: 1 };
const range = object({ start: { type: "integer", min: 0 }, end: { type: "integer", min: 1 } });
const documentRule = object({
  id, kind: string(["pdf", "text", "docx"]), title: optional(string()),
  blocks: array(object({
    id, documentId: id, text: string(),
    location: optional(object({ page: optional(page), section: optional(string()), paragraph: optional(page) })),
    original: optional(object({ segmentId: id, charRange: range })),
    normalizedRange: optional(range),
  }), 1),
});
const representationRule: Rule = { type: "union", options: [
  object({ kind: string(["binary"]), subjectConceptId: id, relation: string(), objectConceptId: id }),
  object({ kind: string(["complex"]), participants: array(object({ conceptId: id, role: string() }), 1, 20) }),
] };
const graphRule = object({
  id, documentId: id, kind: string(["source", "learner"]),
  topics: array(object({ id, title: string() }), 1, 12),
  concepts: array(object({ id, documentId: id, name: string(), aliases: array(string(), 0, 20), symbol: optional(string()) }), 0, 100),
  statements: array(object({
    id, topicId: id, representation: representationRule,
    assertion: string(), negated: { type: "boolean" }, conditions: array(string(), 0, 20),
    formula: optional(string()), role: string(["definition", "fact", "mechanism", "formula", "example"]),
    evidenceIds: array(id, 1, 4),
  }), 0, 120),
  evidence: array(object({
    id, documentId: id, blockId: id, quote: string(), kind: string(["source_quote", "learner_quote"]),
    verification: string(["verified", "unverified"]), contextBefore: optional(string()), contextAfter: optional(string()),
    location: optional(object({ page: optional(page), charRange: optional(range) })),
  }), 0, 480),
});
const version = string(["2.0"]);
const provenance = string(["synthetic_demo", "analysis"]);
const sourceWarningRule = object({ code: string(["EMPTY_PDF_PAGE", "DOCX_EXTRACTION_WARNING"]), message: string(), page: optional(page) });
const analysisRule = object({
  schemaVersion: version, id, provenance, document: documentRule, graph: graphRule,
  lessonSections: array(object({
    id, topicId: id, summary: string(), statementIds: array(id, 1, 120),
    keyPoints: array(object({ id, text: string(), statementIds: array(id, 1, 120) }), 1, 20),
  }), 1, 12),
  sourceWarnings: optional(array(sourceWarningRule)),
  analysisWarnings: optional(array(object({ code: string(["AMBIGUOUS_EVIDENCE", "QUESTIONS_PRESENT", "EXTRACTION_REVIEW", "UNUSED_CONCEPT", "COVERAGE_LIMIT"]), message: string(), blockId: optional(id), statementId: optional(id), conceptId: optional(id) }))),
});
const refRule = object({ graphId: id, statementId: id });
const evaluationRule = object({
  schemaVersion: version, id, provenance, sourceAnalysisId: id, topicIds: array(id, 1),
  learnerDocument: documentRule, learnerGraph: graphRule,
  comparisons: array(object({
    id, referenceRelationshipId: id, topicId: id, sourceStatements: array(refRule, 1), learnerStatements: array(refRule),
    status: string(["correct", "partial", "contradicted", "missing", "uncertain"]),
    explanation: string(), suggestions: array(string(), 0, 10),
  }), 0, 120),
  additionalIdeas: array(object({ id, topicId: optional(id), learnerStatements: array(refRule, 1, 120), explanation: string() }), 0, 120),
  conceptAlignments: optional(array(object({ learnerConceptId: id, referenceConceptId: id, status: string(["matched", "uncertain"]), explanation: string() }), 0, 100)),
});
const demoRule = object({
  description: string(), sourceAnalysis: analysisRule, learnerText: string(), evaluation: evaluationRule,
});
const importedSourceRule = object({
  schemaVersion: version, document: documentRule,
  originalSegments: array(object({ id, text: { type: "string", allowEmpty: true }, page: optional(page) }), 1),
  normalizedText: string(),
  metadata: object({
    extractor: string(["text", "unpdf", "mammoth"]),
    originalCharacterCount: { type: "integer", min: 1 },
    normalizedCharacterCount: { type: "integer", min: 1 },
    fileSizeBytes: optional({ type: "integer", min: 1 }), pageCount: optional(page),
  }),
  warnings: array(sourceWarningRule),
});
const evaluateRequestRule = object({
  schemaVersion: version, importedSource: optional(importedSourceRule), sourceAnalysis: analysisRule,
  topicIds: array(id, 1), learner: object({ text: string() }),
});
const errorRule = object({
  code: string(["INVALID_REQUEST", "UNSUPPORTED_SOURCE", "PAYLOAD_TOO_LARGE", "UNREADABLE_DOCUMENT", "OCR_UNSUPPORTED", "PASSWORD_REQUIRED", "SOURCE_IMPORT_FAILED", "AI_NOT_CONFIGURED", "AI_TIMEOUT", "AI_RATE_LIMITED", "AI_OUTPUT_INVALID", "AI_OUTPUT_TRUNCATED", "NO_EXTRACTABLE_KNOWLEDGE", "INVALID_SOURCE_ANALYSIS", "ANALYSIS_FAILED", "EVALUATION_FAILED", "TRANSCRIPTION_FAILED", "UPSTREAM_UNAVAILABLE"]),
  message: string(), retryable: { type: "boolean" },
  details: optional(array(object({ path: string(), message: string() }))),
});
function responseRule(input: unknown, data: Rule): Rule {
  const ok = (input as { ok?: unknown } | null)?.ok;
  return object(ok === false
    ? { ok: { type: "boolean" }, schemaVersion: version, error: errorRule }
    : { ok: { type: "boolean" }, schemaVersion: version, data });
}

function issue(issues: ValidationIssue[], path: string, code: ValidationIssue["code"], message: string, metadata: Pick<ValidationIssue, "ruleId" | "ids" | "catalogFound"> = {}) {
  issues.push({ path, code, message, ...metadata });
}
/** Domain payloads contain JSON primitives; object key order is not semantic. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

function shape(value: unknown, rule: Rule, path: string, issues: ValidationIssue[]): void {
  if (value === undefined && rule.optional) return;
  switch (rule.type) {
    case "union": {
      const alternatives = rule.options.map(option => { const found: ValidationIssue[] = []; shape(value, option, path, found); return found; });
      if (alternatives.every(found => found.length)) issue(issues, path, "shape", "Expected exactly one supported binary or complex representation.");
      return;
    }
    case "string":
      if (typeof value !== "string" || (!rule.allowEmpty && !value.trim())) {
        issue(issues, path, "shape", "Expected a non-empty string.");
      } else if (rule.values && !rule.values.includes(value)) {
        issue(issues, path, "shape", `Expected one of: ${rule.values.join(", ")}.`);
      } else if (rule.id && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
        issue(issues, path, "shape", "ID must use letters, digits, dot, underscore, colon or hyphen.");
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") issue(issues, path, "shape", "Expected a boolean.");
      break;
    case "integer":
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < rule.min) {
        issue(issues, path, "shape", `Expected a safe integer >= ${rule.min}.`);
      }
      break;
    case "array":
      if (!Array.isArray(value)) { issue(issues, path, "shape", "Expected an array."); break; }
      if (rule.max !== undefined && value.length > rule.max) { issue(issues, path, "shape", `Expected at most ${rule.max} items.`); break; }
      if (value.length < rule.min) issue(issues, path, "shape", `Expected at least ${rule.min} items.`);
      value.forEach((item, index) => shape(item, rule.item, `${path}[${index}]`, issues));
      break;
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        issue(issues, path, "shape", "Expected an object."); break;
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(rule.fields, key)) issue(issues, `${path}.${key}`, "shape", "Unknown field.");
      }
      for (const [key, field] of Object.entries(rule.fields)) shape(record[key], field, `${path}.${key}`, issues);
      break;
    }
  }
}

function result<T>(value: unknown, issues: ValidationIssue[]): ValidationResult<T> {
  return issues.length ? { valid: false, issues } : { valid: true, value: value as T, issues: [] };
}

function unique(values: string[], path: string, issues: ValidationIssue[], field?: string) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) issue(issues, `${path}[${index}]${field ? `.${field}` : ""}`, "invariant", `Duplicate ID/reference: ${value}.`);
    seen.add(value);
  });
}

function exists(idValue: string, ids: Set<string>, path: string, issues: ValidationIssue[]) {
  if (!ids.has(idValue)) issue(issues, path, "reference", `Unknown reference: ${idValue}.`);
}

function checkDocument(doc: Document, documentPath: string, issues: ValidationIssue[]) {
  unique(doc.blocks.map(b => b.id), `${documentPath}.blocks`, issues);
  doc.blocks.forEach((block, i) => {
    if (block.documentId !== doc.id) issue(issues, `${documentPath}.blocks[${i}].documentId`, "reference", "Wrong document.");
    if (doc.kind !== "pdf" && block.location?.page !== undefined) {
      issue(issues, `${documentPath}.blocks[${i}].location.page`, "invariant", "Text/DOCX must not have invented PDF pages.");
    }
  });
}

function checkGraph(doc: Document, graph: KnowledgeGraph, documentPath: string, graphPath: string, issues: ValidationIssue[]) {
  checkDocument(doc, documentPath, issues);
  if (graph.documentId !== doc.id) issue(issues, `${graphPath}.documentId`, "reference", "Wrong document.");
  for (const key of ["topics", "concepts", "statements", "evidence"] as const) {
    unique(graph[key].map(entity => entity.id), `${graphPath}.${key}`, issues);
  }
  const topics = new Set(graph.topics.map(t => t.id));
  const concepts = new Map(graph.concepts.map(c => [c.id, c]));
  const evidenceIds = new Set(graph.evidence.map(e => e.id));
  for (const finding of inspectRepeatedAssertions(graph.statements, graph.concepts, `${graphPath}.statements`)) issue(issues, finding.path, finding.code, finding.message, { ruleId: finding.ruleId, ids: finding.ids });
  graph.concepts.forEach((concept, i) => {
    if (concept.documentId !== doc.id) issue(issues, `${graphPath}.concepts[${i}].documentId`, "reference", "Concept belongs to the wrong document.");
    unique(concept.aliases, `${graphPath}.concepts[${i}].aliases`, issues);
  });
  graph.statements.forEach((statement, i) => {
    const p = `${graphPath}.statements[${i}]`;
    exists(statement.topicId, topics, `${p}.topicId`, issues);
    const r = statement.representation;
    referencedConceptIds(r).forEach((conceptId, j) => exists(conceptId, new Set(concepts.keys()), r.kind === "binary" ? `${p}.representation.${j === 0 ? "subjectConceptId" : "objectConceptId"}` : `${p}.representation.participants[${j}].conceptId`, issues));
    if (r.kind === "complex") unique(r.participants.map(p => JSON.stringify([p.conceptId, p.role])), `${p}.representation.participants`, issues);
    for (const finding of inspectStatement(statement, graph.concepts, p)) {
      if (finding.severity === "error") issue(issues, finding.path, finding.code, finding.message, { ruleId: finding.ruleId, ids: finding.ids });
    }
    unique(statement.evidenceIds, `${p}.evidenceIds`, issues);
    statement.evidenceIds.forEach((e, j) => exists(e, evidenceIds, `${p}.evidenceIds[${j}]`, issues));
    if (statement.role === "formula" && !statement.formula) issue(issues, `${p}.formula`, "invariant", "Formula role requires a formula.");
  });
  graph.evidence.forEach((evidence, i) => {
    const p = `${graphPath}.evidence[${i}]`;
    if (evidence.documentId !== doc.id) issue(issues, `${p}.documentId`, "reference", "Wrong evidence document.");
    const block = doc.blocks.find(b => b.id === evidence.blockId);
    if (!block) issue(issues, `${p}.blockId`, "reference", "Unknown source block.");
    const expectedKind = graph.kind === "source" ? "source_quote" : "learner_quote";
    if (evidence.kind !== expectedKind) issue(issues, `${p}.kind`, "invariant", "Evidence kind must match graph kind.");
    if (evidence.location?.page !== undefined &&
      (doc.kind !== "pdf" || evidence.location.page !== block?.location?.page)) {
      issue(issues, `${p}.location.page`, "evidence", "Page must match the PDF block location.");
    }
    const span = evidence.location?.charRange;
    if (span && (span.start >= span.end || (block && span.end > block.text.length))) {
      issue(issues, `${p}.location.charRange`, "evidence", "Invalid block-local range.");
    }
    if (block && !block.text.includes(evidence.quote)) issue(issues, `${p}.quote`, "evidence", "Quote must exist in its referenced block, even when occurrence is ambiguous.");
    if (span && block && block.text.slice(span.start, span.end) !== evidence.quote) issue(issues, `${p}.location.charRange`, "evidence", "Any supplied range must match the quote, including unverified evidence.");
    for (const field of ["contextBefore", "contextAfter"] as const) {
      if (evidence[field] !== undefined && (!span || !block || (field === "contextBefore" ? !block.text.slice(0, span.start).endsWith(evidence[field]!) : !block.text.slice(span.end).startsWith(evidence[field]!)))) issue(issues, `${p}.${field}`, "evidence", "Backend context must match the located quote exactly.");
    }
    if (block && evidence.verification === "verified") {
      const actual = span ? block.text.slice(span.start, span.end) : undefined;
      if (!span || actual !== evidence.quote) {
        issue(issues, `${p}.quote`, "evidence", "Verified quote must match the supplied block/range exactly.");
      }
    }
  });
}

function checkSource(source: SourceAnalysis, path: string, issues: ValidationIssue[]) {
  checkGraph(source.document, source.graph, `${path}.document`, `${path}.graph`, issues);
  if (source.graph.kind !== "source") issue(issues, `${path}.graph.kind`, "invariant", "Expected source graph.");
  if (!source.graph.statements.length) issue(issues, `${path}.graph.statements`, "invariant", "Source analysis needs at least one statement.");
  const topics = new Set(source.graph.topics.map(t => t.id));
  source.analysisWarnings?.forEach((warning, i) => {
    if (warning.blockId) exists(warning.blockId, new Set(source.document.blocks.map(b => b.id)), `${path}.analysisWarnings[${i}].blockId`, issues);
    if (warning.statementId) exists(warning.statementId, new Set(source.graph.statements.map(s => s.id)), `${path}.analysisWarnings[${i}].statementId`, issues);
    if (warning.conceptId) exists(warning.conceptId, new Set(source.graph.concepts.map(c => c.id)), `${path}.analysisWarnings[${i}].conceptId`, issues);
  });
  source.sourceWarnings?.forEach((warning, i) => {
    if (warning.code === "EMPTY_PDF_PAGE" && (source.document.kind !== "pdf" || warning.page === undefined)) issue(issues, `${path}.sourceWarnings[${i}]`, "invariant", "Empty PDF page warnings require a PDF and a page.");
    if (warning.code === "DOCX_EXTRACTION_WARNING" && (source.document.kind !== "docx" || warning.page !== undefined)) issue(issues, `${path}.sourceWarnings[${i}]`, "invariant", "DOCX warnings have no page.");
  });
  const statements = new Map(source.graph.statements.map(s => [s.id, s]));
  unique(source.lessonSections.map(s => s.id), `${path}.lessonSections`, issues);
  unique(source.lessonSections.map(s => s.topicId), `${path}.lessonSections`, issues, "topicId");
  source.lessonSections.forEach((section, i) => {
    const p = `${path}.lessonSections[${i}]`;
    exists(section.topicId, topics, `${p}.topicId`, issues);
    unique(section.keyPoints.map(k => k.id), `${p}.keyPoints`, issues);
    const checkLinks = (ids: string[], linkPath: string) => {
      unique(ids, linkPath, issues);
      ids.forEach((idValue, j) => {
        const statement = statements.get(idValue);
        if (!statement) issue(issues, `${linkPath}[${j}]`, "reference", "Unknown source statement.");
        else if (statement.topicId !== section.topicId) issue(issues, `${linkPath}[${j}]`, "invariant", "Lesson link crosses topic boundary.");
      });
    };
    checkLinks(section.statementIds, `${p}.statementIds`);
    section.keyPoints.forEach((point, j) => checkLinks(point.statementIds, `${p}.keyPoints[${j}].statementIds`));
  });
  for (const topic of topics) {
    if (!source.lessonSections.some(s => s.topicId === topic)) issue(issues, `${path}.lessonSections`, "invariant", `Missing section for topic: ${topic}.`);
  }
}

function checkEvaluation(source: SourceAnalysis, evaluation: EvaluationResult, path: string, issues: ValidationIssue[]) {
  const learner = evaluation.learnerGraph;
  checkGraph(evaluation.learnerDocument, learner, `${path}.learnerDocument`, `${path}.learnerGraph`, issues);
  if (learner.kind !== "learner" || evaluation.learnerDocument.kind !== "text") {
    issue(issues, `${path}.learnerGraph`, "invariant", "Learner input must be a text document and learner graph.");
  }
  if (source.id !== evaluation.sourceAnalysisId) issue(issues, `${path}.sourceAnalysisId`, "reference", "Wrong source analysis.");
  if (learner.id === source.graph.id || evaluation.learnerDocument.id === source.document.id) {
    issue(issues, `${path}.learnerGraph`, "invariant", "Source and learner graph/document IDs must be distinct in this bundle.");
  }
  if (evaluation.provenance !== source.provenance) issue(issues, `${path}.provenance`, "invariant", "Do not mix synthetic and actual analysis.");
  unique(evaluation.topicIds, `${path}.topicIds`, issues);
  const sourceTopics = new Set(source.graph.topics.map(t => t.id));
  const selected = new Set(evaluation.topicIds);
  evaluation.topicIds.forEach((t, i) => exists(t, sourceTopics, `${path}.topicIds[${i}]`, issues));
  unique(evaluation.comparisons.map(c => c.id), `${path}.comparisons`, issues);
  unique(evaluation.additionalIdeas.map(a => a.id), `${path}.additionalIdeas`, issues);
  const sourceUsage = new Set<string>();
  const learnerUsage = new Set<string>();
  const checkRefs = (refs: StatementRef[], graph: KnowledgeGraph, topic: string | undefined, refPath: string) => {
    unique(refs.map(r => r.statementId), refPath, issues);
    refs.forEach((ref, i) => {
      const p = `${refPath}[${i}]`;
      if (ref.graphId !== graph.id) issue(issues, `${p}.graphId`, "reference", "Reference targets the wrong graph.");
      const statement = graph.statements.find(s => s.id === ref.statementId);
      if (!statement) issue(issues, `${p}.statementId`, "reference", "Unknown statement.");
      else if (graph.kind === "source" && statement.topicId !== topic) {
        issue(issues, p, "invariant", "Statement does not belong to the comparison's source topic.");
      }
      const usage = graph.kind === "source" ? sourceUsage : learnerUsage;
      if (graph.kind === "source" && usage.has(ref.statementId)) issue(issues, `${p}.statementId`, "invariant", "Statement is counted more than once.");
      usage.add(ref.statementId);
    });
  };
  evaluation.comparisons.forEach((comparison, i) => {
    const p = `${path}.comparisons[${i}]`;
    exists(comparison.topicId, selected, `${p}.topicId`, issues);
    if (comparison.referenceRelationshipId !== undefined && (comparison.sourceStatements.length !== 1 || comparison.sourceStatements[0].statementId !== comparison.referenceRelationshipId)) {
      issue(issues, `${p}.referenceRelationshipId`, "reference", "Relationship ID must match the single source statement reference.");
    }
    checkRefs(comparison.sourceStatements, source.graph, comparison.topicId, `${p}.sourceStatements`);
    checkRefs(comparison.learnerStatements, learner, comparison.topicId, `${p}.learnerStatements`);
    if (comparison.status === "missing" && comparison.learnerStatements.length) {
      issue(issues, `${p}.learnerStatements`, "invariant", "Missing has no corresponding learner statement.", { ruleId: "missing_with_learner_claim", ids: { referenceRelationshipId: comparison.referenceRelationshipId ?? "" } });
    } else if (!["missing", "uncertain"].includes(comparison.status) && !comparison.learnerStatements.length) {
      issue(issues, `${p}.learnerStatements`, "invariant", "This status requires a learner statement.", { ruleId: "status_requires_learner_claim", ids: { referenceRelationshipId: comparison.referenceRelationshipId ?? "" } });
    }
    if (comparison.status !== "uncertain") {
      const requireVerified = (refs: StatementRef[], graph: KnowledgeGraph, refPath: string) => {
        refs.forEach((ref, j) => {
          const statement = graph.statements.find(s => s.id === ref.statementId);
          if (statement && !statement.evidenceIds.some(idValue => graph.evidence.some(e => e.id === idValue && e.verification === "verified"))) {
            issue(issues, `${refPath}[${j}]`, "evidence", "A definite status requires at least one verified quote for each referenced statement; otherwise use uncertain.");
          }
        });
      };
      requireVerified(comparison.sourceStatements, source.graph, `${p}.sourceStatements`);
      requireVerified(comparison.learnerStatements, learner, `${p}.learnerStatements`);
    }
  });
  evaluation.additionalIdeas.forEach((idea, i) => {
    const p = `${path}.additionalIdeas[${i}]`;
    if (idea.topicId) exists(idea.topicId, selected, `${p}.topicId`, issues);
    for (const ref of idea.learnerStatements) if (learnerUsage.has(ref.statementId)) issue(issues, `${p}.learnerStatements`, "invariant", "An additional idea cannot also be a matched learner claim or another additional idea.", { ruleId: "claim_classification_conflict", ids: { statementId: ref.statementId } });
    checkRefs(idea.learnerStatements, learner, idea.topicId, `${p}.learnerStatements`);
  });
  source.graph.statements.filter(s => selected.has(s.topicId)).forEach(s => {
    if (!sourceUsage.has(s.id)) issue(issues, `${path}.comparisons`, "invariant", `Unclassified source statement: ${s.id}.`, { ruleId: "unclassified_reference_statement", ids: { referenceRelationshipId: s.id } });
  });
  learner.statements.forEach((s, i) => {
    if (!learnerUsage.has(s.id)) issue(issues, `${path}.learnerGraph.statements[${i}]`, "invariant", `Unclassified learner statement: ${s.id}.`, { ruleId: "unclassified_learner_claim", ids: { statementId: s.id } });
  });
  const alignments = evaluation.conceptAlignments ?? [];
  unique(alignments.map(a => a.learnerConceptId), `${path}.conceptAlignments`, issues, "learnerConceptId");
  alignments.forEach((a, i) => {
    const p = `${path}.conceptAlignments[${i}]`;
    exists(a.learnerConceptId, new Set(learner.concepts.map(c => c.id)), `${p}.learnerConceptId`, issues);
    exists(a.referenceConceptId, new Set(source.graph.concepts.map(c => c.id)), `${p}.referenceConceptId`, issues);
    // A semantic alignment must be supported by a comparison joining those claims.
    const supported = evaluation.comparisons.some(c => c.learnerStatements.some(ref => {
      const ls = learner.statements.find(s => s.id === ref.statementId);
      const rs = source.graph.statements.find(s => s.id === c.referenceRelationshipId);
      return ls && rs && referencedConceptIds(ls.representation).includes(a.learnerConceptId) && referencedConceptIds(rs.representation).includes(a.referenceConceptId);
    }));
    if (!supported) issue(issues, p, "reference", "Concept alignment must be supported by a linked source/learner statement comparison.", { ruleId: "unsupported_concept_alignment", ids: { learnerConceptId: a.learnerConceptId, referenceConceptId: a.referenceConceptId } });
  });
}

export function validateSourceAnalysis(input: unknown): ValidationResult<SourceAnalysis> {
  const issues: ValidationIssue[] = [];
  shape(input, analysisRule, "$", issues);
  if (!issues.length) checkSource(input as SourceAnalysis, "$", issues);
  return result(input, issues);
}

/** Conservative normalization: newline encoding and boundary whitespace only. */
export function normalizeSourceText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function validateImportedSource(input: unknown): ValidationResult<ImportedSource> {
  const issues: ValidationIssue[] = [];
  shape(input, importedSourceRule, "$", issues);
  if (issues.length) return result(input, issues);
  const source = input as ImportedSource;
  const doc = source.document;
  checkDocument(doc, "$.document", issues);
  unique(source.originalSegments.map(s => s.id), "$.originalSegments", issues);
  const segments = new Map(source.originalSegments.map(s => [s.id, s]));
  const segmentOrder = new Map(source.originalSegments.map((s, i) => [s.id, i]));
  const consumed = new Map<string, number>();
  let previousSegmentIndex = -1;
  let previousNormalizedEnd = 0;
  doc.blocks.forEach((block, i) => {
    const p = `$.document.blocks[${i}]`;
    if (!block.original) { issue(issues, `${p}.original`, "reference", "Imported blocks require original segment ranges."); return; }
    const segment = segments.get(block.original.segmentId);
    if (!segment) { issue(issues, `${p}.original.segmentId`, "reference", "Unknown original segment."); return; }
    const span = block.original.charRange;
    if (span.start >= span.end || span.end > segment.text.length) issue(issues, `${p}.original.charRange`, "evidence", "Invalid original segment range.");
    if (normalizeSourceText(segment.text.slice(span.start, span.end)) !== block.text) issue(issues, `${p}.text`, "evidence", "Normalized block must match its original range exactly.");
    if (block.location?.page !== segment.page) issue(issues, `${p}.location.page`, "evidence", "Block page must match its original segment.");
    if (block.location?.paragraph === undefined) issue(issues, `${p}.location.paragraph`, "reference", "Imported blocks require paragraph positions.");
    const index = segmentOrder.get(segment.id)!;
    const lastEnd = consumed.get(segment.id) ?? 0;
    if (index < previousSegmentIndex || span.start < lastEnd) issue(issues, `${p}.original`, "invariant", "Original ranges must be ordered and non-overlapping.");
    if (/\S/.test(segment.text.slice(lastEnd, span.start))) issue(issues, `${p}.original`, "invariant", "Non-whitespace source content was omitted.");
    previousSegmentIndex = index;
    consumed.set(segment.id, span.end);
    const normalized = block.normalizedRange;
    if (!normalized) issue(issues, `${p}.normalizedRange`, "reference", "Imported blocks require normalized text ranges.");
    else {
      if (normalized.start < previousNormalizedEnd || normalized.start >= normalized.end || normalized.end > source.normalizedText.length) issue(issues, `${p}.normalizedRange`, "evidence", "Normalized ranges must be ordered, non-overlapping, and in bounds.");
      if (source.normalizedText.slice(normalized.start, normalized.end) !== block.text) issue(issues, `${p}.normalizedRange`, "evidence", "Normalized range must match block text.");
      if (/\S/.test(source.normalizedText.slice(previousNormalizedEnd, normalized.start))) issue(issues, `${p}.normalizedRange`, "invariant", "Normalized content was omitted.");
      previousNormalizedEnd = normalized.end;
    }
  });
  source.originalSegments.forEach((segment, i) => {
    if (/\S/.test(segment.text.slice(consumed.get(segment.id) ?? 0))) issue(issues, `$.originalSegments[${i}]`, "invariant", "Non-whitespace source content was omitted.");
    if (doc.kind === "pdf") {
      if (segment.page !== i + 1) issue(issues, `$.originalSegments[${i}].page`, "invariant", "PDF segments must preserve every page in order.");
      const warnings = source.warnings.filter(w => w.code === "EMPTY_PDF_PAGE" && w.page === segment.page);
      if (normalizeSourceText(segment.text) ? warnings.length !== 0 : warnings.length !== 1) issue(issues, "$.warnings", "invariant", "Exactly one warning is required for each empty PDF page.");
    } else if (segment.page !== undefined) issue(issues, `$.originalSegments[${i}].page`, "invariant", "Text/DOCX have no stable page numbers.");
  });
  if (source.normalizedText !== source.originalSegments.map(s => normalizeSourceText(s.text)).join("\n\n")) issue(issues, "$.normalizedText", "invariant", "Normalized text must equal normalized original segments joined by two newlines.");
  if (/\S/.test(source.normalizedText.slice(previousNormalizedEnd))) issue(issues, "$.normalizedText", "invariant", "Normalized content was omitted.");
  if (source.metadata.normalizedCharacterCount !== source.normalizedText.length) issue(issues, "$.metadata.normalizedCharacterCount", "invariant", "Incorrect normalized character count.");
  if (source.metadata.originalCharacterCount !== source.originalSegments.map(s => s.text).join("\n\n").length) issue(issues, "$.metadata.originalCharacterCount", "invariant", "Incorrect original character count.");
  if (source.metadata.extractor !== ({ text: "text", pdf: "unpdf", docx: "mammoth" } as const)[doc.kind]) issue(issues, "$.metadata.extractor", "invariant", "Extractor must match source kind.");
  if (doc.kind === "pdf" ? source.metadata.pageCount !== source.originalSegments.length : source.metadata.pageCount !== undefined) issue(issues, "$.metadata.pageCount", "invariant", "Only PDFs have page counts, matching all original segments.");
  if (doc.kind === "text" ? source.metadata.fileSizeBytes !== undefined : source.metadata.fileSizeBytes === undefined) issue(issues, "$.metadata.fileSizeBytes", "invariant", "Only uploaded files require file sizes.");
  source.warnings.forEach((warning, i) => {
    if (warning.code === "EMPTY_PDF_PAGE" && (doc.kind !== "pdf" || !source.originalSegments.some(s => s.page === warning.page && !normalizeSourceText(s.text)))) issue(issues, `$.warnings[${i}]`, "reference", "Empty page warning must identify an actual empty PDF page.");
    if (warning.code === "DOCX_EXTRACTION_WARNING" && (doc.kind !== "docx" || warning.page !== undefined)) issue(issues, `$.warnings[${i}]`, "invariant", "DOCX warnings have no page number.");
  });
  return result(input, issues);
}

export function validateAnalyzeImportedSourceRequest(input: unknown): ValidationResult<AnalyzeImportedSourceRequest> {
  const issues: ValidationIssue[] = [];
  shape(input, object({ schemaVersion: version, importedSource: importedSourceRule, outputLanguage: optional(string(["source", "en", "vi"])) }), "$", issues);
  if (!issues.length) {
    const validation = validateImportedSource((input as AnalyzeImportedSourceRequest).importedSource);
    if (!validation.valid) issues.push(...validation.issues.map(i => ({ ...i, path: `$.importedSource${i.path.slice(1)}` })));
  }
  return result(input, issues);
}

/** Bind an analysis to its exact ImportedSource; legacy raw-text APIs remain separate. */
export function validateImportedAnalysisResponse(requestInput: unknown, input: unknown): ValidationResult<AnalyzeSourceResponse> {
  const request = validateAnalyzeImportedSourceRequest(requestInput);
  const issues: ValidationIssue[] = request.valid ? [] : [...request.issues];
  shape(input, responseRule(input, analysisRule), "$", issues);
  if (!issues.length && request.valid) {
    const response = input as AnalyzeSourceResponse;
    if (response.ok) {
      checkSource(response.data, "$.data", issues);
      // Domain objects contain only JSON primitives; compare keys independent of order.
      const canonical = (v: unknown): string => {
        if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
        if (v && typeof v === "object") return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
        return JSON.stringify(v);
      };
      if (canonical(response.data.document) !== canonical(request.value.importedSource.document)) issue(issues, "$.data.document", "invariant", "Imported document and blocks must remain unchanged.");
      if (canonical(response.data.sourceWarnings) !== canonical(request.value.importedSource.warnings)) issue(issues, "$.data.sourceWarnings", "invariant", "Ingestion warnings must be retained unchanged.");
      if (response.data.provenance !== "analysis") issue(issues, "$.data.provenance", "invariant", "Expected actual analysis provenance.");
    }
  }
  return result(input, issues);
}

export function validateEvaluationResult(sourceInput: unknown, input: unknown): ValidationResult<EvaluationResult> {
  const source = validateSourceAnalysis(sourceInput);
  const issues: ValidationIssue[] = source.valid ? [] : source.issues.map(i => ({ ...i, path: `$.sourceAnalysis${i.path.slice(1)}` }));
  shape(input, evaluationRule, "$", issues);
  if (!issues.length && source.valid) checkEvaluation(source.value, input as EvaluationResult, "$", issues);
  return result(input, issues);
}

export function validateAnalyzeSourceRequest(input: unknown): ValidationResult<AnalyzeSourceRequest> {
  const kind = (input as { source?: { kind?: unknown } } | null)?.source?.kind;
  const sourceFields: Record<string, Rule> = { kind: string(["text", "pdf"]), title: optional(string()) };
  if (kind !== "pdf") sourceFields.text = string();
  const issues: ValidationIssue[] = [];
  shape(input, object({ schemaVersion: version, source: object(sourceFields) }), "$", issues);
  return result(input, issues);
}

export function validateEvaluateTextRequest(input: unknown): ValidationResult<EvaluateTextRequest> {
  const issues: ValidationIssue[] = [];
  shape(input, evaluateRequestRule, "$", issues);
  if (!issues.length) {
    const request = input as EvaluateTextRequest;
    checkSource(request.sourceAnalysis, "$.sourceAnalysis", issues);
    if (request.importedSource) {
      const imported = validateImportedSource(request.importedSource);
      if (!imported.valid) issues.push(...imported.issues.map(i => ({ ...i, path: `$.importedSource${i.path.slice(1)}` })));
      if (canonicalJson(request.importedSource.document) !== canonicalJson(request.sourceAnalysis.document)) {
        issue(issues, "$.importedSource.document", "invariant", "Imported source and analysis document must match exactly.");
      }
    }
    unique(request.topicIds, "$.topicIds", issues);
    const topics = new Set(request.sourceAnalysis.graph.topics.map(t => t.id));
    request.topicIds.forEach((t, i) => exists(t, topics, `$.topicIds[${i}]`, issues));
  }
  return result(input, issues);
}

export function validateDemo(input: unknown): ValidationResult<ExplainBackDemo> {
  const issues: ValidationIssue[] = [];
  shape(input, demoRule, "$", issues);
  if (!issues.length) {
    const demo = input as ExplainBackDemo;
    checkSource(demo.sourceAnalysis, "$.sourceAnalysis", issues);
    checkEvaluation(demo.sourceAnalysis, demo.evaluation, "$.evaluation", issues);
    if (demo.sourceAnalysis.provenance !== "synthetic_demo" || demo.evaluation.provenance !== "synthetic_demo") {
      issue(issues, "$.sourceAnalysis.provenance", "invariant", "Demo must be marked synthetic_demo.");
    }
    if (demo.learnerText !== demo.evaluation.learnerDocument.blocks.map(b => b.text).join("\n\n")) {
      issue(issues, "$.learnerText", "invariant", "Learner text must equal the ordered learner blocks joined with two newlines.");
    }
  }
  return result(input, issues);
}

export function validateAnalyzeSourceResponse(requestInput: unknown, input: unknown): ValidationResult<AnalyzeSourceResponse> {
  const request = validateAnalyzeSourceRequest(requestInput);
  const issues: ValidationIssue[] = request.valid ? [] : request.issues.map(i => ({ ...i, path: `$.request${i.path.slice(1)}` }));
  shape(input, responseRule(input, analysisRule), "$", issues);
  if (!issues.length && request.valid) {
    const response = input as AnalyzeSourceResponse;
    if (response.ok) {
      checkSource(response.data, "$.data", issues);
      if (response.data.document.kind !== request.value.source.kind) issue(issues, "$.data.document.kind", "invariant", "Document kind differs from request.");
      if (request.value.source.kind === "text" && response.data.document.blocks.map(b => b.text).join("\n\n") !== request.value.source.text) {
        issue(issues, "$.data.document.blocks", "invariant", "Text source must be preserved exactly, joining blocks with two newlines.");
      }
    }
  }
  return result(input, issues);
}

export function validateEvaluateTextResponse(requestInput: unknown, input: unknown): ValidationResult<EvaluateTextResponse> {
  const request = validateEvaluateTextRequest(requestInput);
  const issues: ValidationIssue[] = request.valid ? [] : request.issues.map(i => ({ ...i, path: `$.request${i.path.slice(1)}` }));
  shape(input, responseRule(input, evaluationRule), "$", issues);
  if (!issues.length && request.valid) {
    const response = input as EvaluateTextResponse;
    if (response.ok) {
      checkEvaluation(request.value.sourceAnalysis, response.data, "$.data", issues);
      if (response.data.learnerDocument.blocks.map(b => b.text).join("\n\n") !== request.value.learner.text) {
        issue(issues, "$.data.learnerDocument.blocks", "invariant", "Learner text differs from the evaluation request.");
      }
      if (JSON.stringify([...response.data.topicIds].sort()) !== JSON.stringify([...request.value.topicIds].sort())) {
        issue(issues, "$.data.topicIds", "invariant", "Evaluated topics differ from the requested topics.");
      }
    }
  }
  return result(input, issues);
}
