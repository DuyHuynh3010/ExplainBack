/** Backend domain contract v1. No React Flow types, layout, scores or AI calls. */
export type SchemaVersion = "1.0";
export type EvaluationStatus = "correct" | "partial" | "contradicted" | "missing" | "uncertain";
export type Provenance = "synthetic_demo" | "analysis";

export interface BlockLocation {
  /** Physical PDF page, 1-based. Omitted for text; never invented. */
  page?: number;
  section?: string;
}

export interface SourceBlock {
  id: string;
  documentId: string;
  text: string;
  location?: BlockLocation;
}

export interface Document {
  id: string;
  kind: "pdf" | "text";
  title?: string;
  /** Ordered extracted blocks. Original PDF bytes are outside the domain payload. */
  blocks: SourceBlock[];
}

export interface Topic {
  id: string;
  title: string;
  /** Required on learner topics, absent on source topics. Points into source graph. */
  sourceTopicId?: string;
}

export interface Concept {
  id: string;
  topicId: string;
  name: string;
  aliases: string[];
  symbol?: string;
}

export interface Evidence {
  id: string;
  documentId: string;
  blockId: string;
  quote: string;
  kind: "source_quote" | "learner_quote";
  /** Verifies quote occurrence/location, NOT scientific truth or entailment. */
  verification: "verified" | "unverified";
  location?: {
    page?: number;
    /** Zero-based UTF-16 offsets in block.text; end is exclusive. */
    charRange?: { start: number; end: number };
  };
}

export interface Statement {
  id: string;
  topicId: string;
  subjectConceptId: string;
  relation: string;
  objectConceptId: string;
  /** One complete atomic assertion, including polarity and conditions. */
  assertion: string;
  negated: boolean;
  conditions: string[];
  formula?: string;
  role: "definition" | "fact" | "mechanism" | "formula" | "example";
  evidenceIds: string[];
}

export interface KnowledgeGraph {
  id: string;
  documentId: string;
  kind: "source" | "learner";
  topics: Topic[];
  concepts: Concept[];
  statements: Statement[];
  evidence: Evidence[];
}

export interface LessonSection {
  id: string;
  topicId: string;
  summary: string;
  /** Source statements supporting the summary. */
  statementIds: string[];
  keyPoints: { id: string; text: string; statementIds: string[] }[];
}

export interface SourceAnalysis {
  schemaVersion: SchemaVersion;
  id: string;
  provenance: Provenance;
  document: Document;
  graph: KnowledgeGraph;
  lessonSections: LessonSection[];
}

export interface StatementRef {
  graphId: string;
  statementId: string;
}

export interface ComparisonItem {
  id: string;
  /** Always a topic ID in the source graph. */
  topicId: string;
  sourceStatements: StatementRef[];
  /** Empty for missing; uncertain may also have no learner match. */
  learnerStatements: StatementRef[];
  status: EvaluationStatus;
  explanation: string;
  suggestions: string[];
}

export interface AdditionalIdea {
  id: string;
  /** Source topic for grouping; this is NOT a correctness verdict. */
  topicId: string;
  learnerStatements: StatementRef[];
  explanation: string;
}

export interface EvaluationResult {
  schemaVersion: SchemaVersion;
  id: string;
  provenance: Provenance;
  sourceAnalysisId: string;
  /** Requested source topics; coverage/missing is scoped to these topics. */
  topicIds: string[];
  learnerDocument: Document;
  learnerGraph: KnowledgeGraph;
  comparisons: ComparisonItem[];
  additionalIdeas: AdditionalIdea[];
}

export interface ExplainBackDemo {
  description: string;
  sourceAnalysis: SourceAnalysis;
  learnerText: string;
  evaluation: EvaluationResult;
}
