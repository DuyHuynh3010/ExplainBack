import type { Statement } from "../contracts/domain";
import { ANALYSIS_LIMITS as L } from "./limits";
import { DraftError } from "./errors";

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
  concepts: { id: string; topicId: string; name: string; aliases: string[]; symbol?: string }[];
  statements: {
    id: string; topicId: string; subjectConceptId: string; relation: string;
    objectConceptId: string; assertion: string; negated: boolean; conditions: string[];
    formula?: string; role: Statement["role"]; evidence: DraftEvidence[];
  }[];
  lessonSections: {
    topicId: string; summary: string; statementIds: string[];
    keyPoints: { text: string; statementIds: string[] }[];
  }[];
}

interface JsonRule {
  type: "object" | "array" | "string" | "boolean";
  properties?: Record<string, JsonRule>;
  required?: string[];
  additionalProperties?: false;
  items?: JsonRule;
  minItems?: number;
  maxItems?: number;
  enum?: string[];
}
const text: JsonRule = { type: "string" };
const list = (items: JsonRule, maxItems: number, minItems = 0): JsonRule => ({ type: "array", items, minItems, maxItems });
const obj = (properties: Record<string, JsonRule>, optional: string[] = []): JsonRule => ({
  type: "object", properties, required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false,
});
/** One schema for Gemini structured output and local runtime shape validation. */
export const ANALYSIS_DRAFT_SCHEMA: JsonRule = obj({
  blockDispositions: list(obj({ blockId: text, kind: { type: "string", enum: ["knowledge", "questions", "mixed", "other"] } }), L.blocks, 1),
  topics: list(obj({ id: text, title: text }), L.topics),
  concepts: list(obj({ id: text, topicId: text, name: text, aliases: list(text, 20), symbol: text }, ["symbol"]), L.concepts),
  statements: list(obj({
    id: text, topicId: text, subjectConceptId: text, relation: text, objectConceptId: text,
    assertion: text, negated: { type: "boolean" }, conditions: list(text, 20), formula: text,
    role: { type: "string", enum: ["definition", "fact", "mechanism", "formula", "example"] },
    evidence: list(obj({ blockId: text, quote: text, contextBefore: text, contextAfter: text }, ["contextBefore", "contextAfter"]), L.evidencePerStatement, 1),
  }, ["formula"]), L.statements),
  lessonSections: list(obj({
    topicId: text, summary: text, statementIds: list(text, L.statements, 1),
    keyPoints: list(obj({ text, statementIds: list(text, L.statements, 1) }), L.keyPointsPerTopic, 1),
  }), L.topics),
});

function matches(value: unknown, rule: JsonRule): boolean {
  if (rule.type === "string") return typeof value === "string" && !!value.trim() && (!rule.enum || rule.enum.includes(value));
  if (rule.type === "boolean") return typeof value === "boolean";
  if (rule.type === "array") return Array.isArray(value) && value.length >= (rule.minItems ?? 0) && value.length <= (rule.maxItems ?? Infinity) && value.every(v => matches(v, rule.items!));
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return rule.required!.every(k => Object.hasOwn(record, k)) && Object.keys(record).every(k => Object.hasOwn(rule.properties!, k) && matches(record[k], rule.properties![k]));
}

export function parseDraft(text: string): AnalysisDraft {
  if (text.length > L.outputCharacters) throw new DraftError("AI output exceeds the supported JSON size.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new DraftError("AI output must be valid JSON."); }
  if (!matches(value, ANALYSIS_DRAFT_SCHEMA)) throw new DraftError("AI output does not match the analysis schema or limits.");
  return value as AnalysisDraft;
}
