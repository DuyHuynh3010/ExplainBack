import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ImportedSource, SourceAnalysis } from "../contracts/domain";
import type { AnalysisDraft } from "./draft";
import type { DraftIssue } from "./errors";

export interface AnalysisCapture {
  call: number;
  stage: string;
  importedSource: ImportedSource;
  outputText?: string;
  draft?: AnalysisDraft;
  normalized?: SourceAnalysis;
  issues?: DraftIssue[];
  code?: string;
}
export type CaptureAnalysis = (value: AnalysisCapture) => void;

export interface EvaluationCapture {
  call: number; stage: string; input: import("../contracts/api").EvaluateTextRequest;
  outputText?: string; draft?: import("../explanations/evaluation").EvaluationDraft;
  candidate?: import("../contracts/domain").EvaluationResult; issues?: DraftIssue[];
  alignmentSanitizations?: DraftIssue[];
}
export type CaptureEvaluation = (value: EvaluationCapture) => void;
/** Explicit development opt-in; never enabled merely by requesting diagnostics. */
export function createEvaluationCapture(requestId: string): CaptureEvaluation | undefined {
  if (process.env.NODE_ENV !== "development" || process.env.EXPLAINBACK_EVALUATION_CAPTURE !== "1") return;
  return value => {
    try {
      const directory = join(process.cwd(), ".explainback-artifacts", "evaluations");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${requestId}-call-${value.call}.json`), JSON.stringify(value, null, 2));
    } catch { /* A diagnostic capture never changes the operation. */ }
  };
}

const ruleMessages: Record<string, string> = {
  missing_concept: "Endpoint/participant concept has no local record or exact catalog record.",
  missing_learner_concept: "Learner endpoint/participant has no learner concept record; no source concept fallback is allowed.",
  alignment_after_reference_repair: "Recheck optional alignments after resolving learner references.",
  learner_patch_invalid: "Learner repair has invalid JSON, fields, claim IDs or concept records.",
  literal_object_mismatch: "Object differs from the literal subject/predicate frame: another concept matches the head, the target occurs in a trailing clause, or a non-reflexive self-loop substitutes the subject.",
  negative_relation: "Relation contains negation; preserve polarity separately without double negation.",
  polarity_scope_mismatch: "Literal assertion polarity or modal scope disagrees with the negated flag.",
  incomplete_binary_projection: "Binary projection omits an explicit participant or clause.",
  repeated_conjunctive_assertion: "An unsplit conjunctive assertion is copied onto different partial binary projections.",
  concept_identity_conflict: "Canonical concept identity conflicts with an established record.",
  unclassified_learner_claim: "Learner claim is absent from comparisons and additional ideas.",
  unclassified_reference_statement: "A selected reference statement has no comparison.",
  missing_with_learner_claim: "Missing must not have learner links.",
  status_requires_learner_claim: "This verdict requires a learner claim.",
  claim_classification_conflict: "A claim is classified as both matched and additional, or twice as additional.",
  unsupported_concept_alignment: "Concept alignment lacks a supporting linked comparison.",
  unknown_reference_relationship: "Comparison uses an unknown or unselected reference ID.",
  unknown_learner_claim: "Classification uses an unknown learner claim ID.",
  unknown_alignment_concept: "Alignment uses an unknown learner concept ID.",
  alignment_patch_invalid: "Alignment repair has invalid JSON, shape or selected reference coverage.",
  frozen_extraction_change: "Alignment repair attempted to change frozen extraction fields.",
};

/** Explicit local opt-in only; artifacts contain source text, never SDK/key data. */
export function createAnalysisCapture(requestId: string): CaptureAnalysis | undefined {
  if (process.env.NODE_ENV !== "development" || process.env.EXPLAINBACK_ANALYSIS_CAPTURE !== "1") return;
  return value => {
    try {
      const directory = join(process.cwd(), "test-results", "source-analysis-artifacts");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${requestId}-call-${value.call}.json`), JSON.stringify(value, null, 2));
    } catch { /* Capture failure must not change the API result. */ }
  };
}

/** Console-safe metadata: no raw error message, document, quote or field values. */
export function diagnosticIssues(issues: DraftIssue[]): NonNullable<AnalysisEvent["validationIssues"]> {
  return issues.slice(0, 20).map(issue => ({ path: issue.path.slice(0, 300), rule: issue.code,
    ...(issue.ruleId && ruleMessages[issue.ruleId] ? { ruleId: issue.ruleId, message: ruleMessages[issue.ruleId] } : { message: `Validation rule: ${issue.code}.` }),
    ...(issue.catalogFound !== undefined ? { catalogFound: issue.catalogFound } : {}),
    ...(issue.ids ? { ids: Object.fromEntries(Object.entries(issue.ids).filter(([key, value]) => /^[A-Za-z]+Id$/.test(key) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value))) } : {}) }));
}

/** Server-only metadata. Never pass source text, prompts, SDK errors or credentials. */
export interface AnalysisEvent {
  stage: string;
  call?: number;
  callElapsedMs?: number;
  timeoutMs?: number;
  timeoutOrigin?: "pipeline" | "sdk" | "upstream";
  code?: string;
  upstreamStatus?: number;
  upstreamCode?: string;
  retryAfterSeconds?: number;
  finishReason?: string;
  validation?: "passed" | "failed";
  failedStage?: string;
  purpose?: "initial" | "repair";
  model?: string;
  keyExists?: boolean;
  schemaBytes?: number;
  schemaHasArrayBounds?: boolean;
  outputCharacters?: number;
  thoughtsTokens?: number;
  outputTokens?: number;
  quotaLimits?: { metric: string; id: string }[];
  validationIssues?: { path: string; rule: DraftIssue["code"]; ruleId?: string; message: string; ids?: Record<string, string>; catalogFound?: boolean }[];
  repairKinds?: ("reference" | "representation" | "alignment")[];
  learnerClaimIds?: string[];
  droppedAlignments?: number;
}
export type AnalysisDiagnostic = (event: AnalysisEvent) => void;

/** Existing public {path,message} details shape; internal metadata stays internal. */
export function diagnosticDetails(issues: DraftIssue[]) {
  return diagnosticIssues(issues).map(i => ({ path: i.path, message: `${i.ruleId ?? i.rule}: ${i.message}${i.ids && Object.keys(i.ids).length ? ` IDs: ${JSON.stringify(i.ids)}.` : ""}${i.catalogFound !== undefined ? ` Catalog found: ${i.catalogFound}.` : ""}` }));
}

export function createAnalysisDiagnostic(requestId: string): AnalysisDiagnostic {
  const started = Date.now();
  return event => {
    const line = JSON.stringify({ requestId, elapsedMs: Date.now() - started, ...event });
    console.info("[source-analysis]", line);
    // Ignored development-only metadata log permits tracing an existing dev process.
    // Logging must never fail or change the analysis result.
    if (process.env.NODE_ENV === "development") {
      try {
        const directory = join(process.cwd(), ".next", "dev", "logs");
        mkdirSync(directory, { recursive: true });
        appendFileSync(join(directory, "source-analysis.jsonl"), `${line}\n`);
      } catch { /* Console logging remains available. */ }
    }
  };
}

/** Numeric delay only; no raw headers are exposed or logged. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}
