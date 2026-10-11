import type { Statement, StatementRepresentation } from "../contracts/domain";
import { ANALYSIS_LIMITS as L } from "./limits";
import { DraftError, type DraftIssue } from "./errors";

export interface DraftEvidence {
  blockId: string;
  quote: string;
  /** Exact adjacent source text, only to disambiguate repeated quotes. No AI offsets. */
  contextBefore?: string;
  contextAfter?: string;
}
export interface AnalysisDraft {
  blockDispositions: { blockId: string; kind: "knowledge" | "questions" | "mixed" | "other" }[];
  topics: { id: string; title: string }[];
  concepts: { id: string; name: string; aliases: string[]; symbol?: string }[];
  statements: {
    id: string; topicId: string; representation: StatementRepresentation;
    assertion: string; negated: boolean; conditions: string[];
    formula?: string; role: Statement["role"]; evidence: DraftEvidence[];
  }[];
  lessonSections: {
    topicId: string; summary: string; statementIds: string[];
    keyPoints: { text: string; statementIds: string[] }[];
  }[];
}

export interface JsonRule {
  type?: "object" | "array" | "string" | "boolean";
  anyOf?: JsonRule[];
  properties?: Record<string, JsonRule>;
  required?: string[];
  additionalProperties?: false;
  items?: JsonRule;
  minItems?: number;
  maxItems?: number;
  enum?: string[];
}
export const text: JsonRule = { type: "string" };
export const list = (items: JsonRule, maxItems: number, minItems = 0): JsonRule => ({ type: "array", items, minItems, maxItems });
export const obj = (properties: Record<string, JsonRule>, optional: string[] = []): JsonRule => ({
  type: "object", properties, required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false,
});
export const REPRESENTATION_SCHEMA: JsonRule = { anyOf: [
  obj({ kind: { type: "string", enum: ["binary"] }, subjectConceptId: text, relation: text, objectConceptId: text }),
  obj({ kind: { type: "string", enum: ["complex"] }, participants: list(obj({ conceptId: text, role: text }), 20, 1) }),
] };
export const CONCEPT_SCHEMA = obj({ id: text, name: text, aliases: list(text, 20), symbol: text }, ["symbol"]);
/** Full runtime schema. Gemini receives the same shape without array bounds;
 * all minItems/maxItems limits are still enforced here before normalization.
 */
export const ANALYSIS_DRAFT_SCHEMA: JsonRule = obj({
  blockDispositions: list(obj({ blockId: text, kind: { type: "string", enum: ["knowledge", "questions", "mixed", "other"] } }), L.blocks, 1),
  topics: list(obj({ id: text, title: text }), L.topics),
  concepts: list(CONCEPT_SCHEMA, L.concepts),
  statements: list(obj({
    id: text, topicId: text, representation: REPRESENTATION_SCHEMA,
    assertion: text, negated: { type: "boolean" }, conditions: list(text, 20), formula: text,
    role: { type: "string", enum: ["definition", "fact", "mechanism", "formula", "example"] },
    evidence: list(obj({ blockId: text, quote: text, contextBefore: text, contextAfter: text }, ["contextBefore", "contextAfter"]), L.evidencePerStatement, 1),
  }, ["formula"]), L.statements),
  lessonSections: list(obj({
    topicId: text, summary: text, statementIds: list(text, L.statements, 1),
    keyPoints: list(obj({ text, statementIds: list(text, L.statements, 1) }), L.keyPointsPerTopic, 1),
  }), L.topics),
});

export function matches(value: unknown, rule: JsonRule): boolean {
  if (rule.anyOf) return rule.anyOf.some(option => matches(value, option));
  if (rule.type === "string") return typeof value === "string" && !!value.trim() && (!rule.enum || rule.enum.includes(value));
  if (rule.type === "boolean") return typeof value === "boolean";
  if (rule.type === "array") return Array.isArray(value) && value.length >= (rule.minItems ?? 0) && value.length <= (rule.maxItems ?? Infinity) && value.every(v => matches(v, rule.items!));
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return rule.required!.every(k => Object.hasOwn(record, k)) && Object.keys(record).every(k => Object.hasOwn(rule.properties!, k) && matches(record[k], rule.properties![k]));
}

/** Explain structural failure with schema paths, never quote/field contents. */
function schemaIssues(value: unknown, rule: JsonRule, path = "$"): DraftIssue[] {
  if (matches(value, rule)) return [];
  const issue = (message: string): DraftIssue[] => [{ path, code: "shape", message }];
  if (rule.anyOf) {
    const kind = (value as { kind?: string } | null)?.kind;
    const option = rule.anyOf.find(r => r.properties?.kind.enum?.includes(kind ?? ""));
    return option ? schemaIssues(value, option, path) : issue("Expected a discriminated binary or complex representation.");
  }
  if (rule.type === "string") return issue("Expected a nonempty string matching the schema enum when present; omit unused optional contexts.");
  if (rule.type === "boolean") return issue("Expected a boolean.");
  if (rule.type === "array") {
    if (!Array.isArray(value)) return issue("Expected an array.");
    const bounds = value.length < (rule.minItems ?? 0) || value.length > (rule.maxItems ?? Infinity)
      ? issue(`Expected ${rule.minItems ?? 0} to ${rule.maxItems ?? "unbounded"} items.`) : [];
    return [...bounds, ...value.flatMap((item, i) => schemaIssues(item, rule.items!, `${path}[${i}]`))].slice(0, 20);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return issue("Expected an object.");
  const record = value as Record<string, unknown>;
  const missing = rule.required!.filter(k => !Object.hasOwn(record, k)).map(k => ({ path: `${path}.${k}`, code: "shape" as const, message: "Required field is absent." }));
  const fields = Object.keys(rule.properties!).filter(k => Object.hasOwn(record, k)).flatMap(k => schemaIssues(record[k], rule.properties![k], `${path}.${k}`));
  // Unknown keys are untrusted content; avoid copying them into console metadata.
  const extra = Object.keys(record).some(k => !Object.hasOwn(rule.properties!, k)) ? issue("Unknown fields are not permitted.") : [];
  return [...missing, ...fields, ...extra].slice(0, 20);
}

export function parseDraft(text: string): AnalysisDraft {
  if (text.length > L.outputCharacters) throw new DraftError("AI output exceeds the supported JSON size.", [{ path: "$", code: "shape", message: "Output JSON exceeds the configured character limit." }]);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new DraftError("AI output must be valid JSON.", [{ path: "$", code: "shape", message: "Expected valid JSON." }]); }
  normalizeOptionalFields(value);
  if (!matches(value, ANALYSIS_DRAFT_SCHEMA)) throw new DraftError("AI output does not match the analysis schema or limits.", schemaIssues(value, ANALYSIS_DRAFT_SCHEMA));
  return value as AnalysisDraft;
}

/** Only unused optional fields become absent. Quotes and required strings stay exact. */
export function normalizeOptionalFields(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach(normalizeOptionalFields); return; }
  const record = value as Record<string, unknown>;
  for (const key of ["contextBefore", "contextAfter", "symbol", "formula"]) {
    if (typeof record[key] === "string" && !record[key].trim()) delete record[key];
  }
  Object.values(record).forEach(normalizeOptionalFields);
}
