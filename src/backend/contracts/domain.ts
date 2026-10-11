/** Backend contract v2: document-wide concepts and explicit statement representations. */
export type SchemaVersion = "2.0";
export type EvaluationStatus = "correct" | "partial" | "contradicted" | "missing" | "uncertain";
export type Provenance = "synthetic_demo" | "analysis";

export interface BlockLocation {
  /** Physical PDF page, 1-based. Omitted for text/DOCX; never invented. */
  page?: number;
  section?: string;
  /** 1-based extracted paragraph order within a page or the text/DOCX document. */
  paragraph?: number;
}

export interface SourceBlock {
  id: string;
  documentId: string;
  text: string;
  location?: BlockLocation;
  /** Optional ingestion provenance: UTF-16 range in an ImportedSource original segment. */
  original?: { segmentId: string; charRange: { start: number; end: number } };
  /** Optional UTF-16 range in ImportedSource.normalizedText. */
  normalizedRange?: { start: number; end: number };
}

export interface Document {
  id: string;
  kind: "pdf" | "text" | "docx";
  title?: string;
  /** Ordered extracted blocks. Original PDF bytes are outside the domain payload. */
  blocks: SourceBlock[];
}

/** Input/extraction text before normalization. PDF retains a segment for every page. */
export interface OriginalSourceSegment {
  id: string;
  text: string;
  page?: number;
}

export interface SourceWarning {
  code: "EMPTY_PDF_PAGE" | "DOCX_EXTRACTION_WARNING";
  message: string;
  page?: number;
}

/** Source ingestion only. No AI analysis, topics, knowledge graph, or lesson summary. */
export interface ImportedSource {
  schemaVersion: SchemaVersion;
  document: Document;
  originalSegments: OriginalSourceSegment[];
  /** Normalized original segments joined with two newlines; splitting does not add text. */
  normalizedText: string;
  metadata: {
    extractor: "text" | "unpdf" | "mammoth";
    originalCharacterCount: number;
    normalizedCharacterCount: number;
    fileSizeBytes?: number;
    pageCount?: number;
  };
  warnings: SourceWarning[];
}

export interface Topic {
  id: string;
  title: string;
}

export interface Concept {
  id: string;
  documentId: string;
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
  /** Derived by the backend from a uniquely located quote. */
  contextBefore?: string;
  contextAfter?: string;
  location?: {
    page?: number;
    /** Zero-based UTF-16 offsets in block.text; end is exclusive. */
    charRange?: { start: number; end: number };
  };
}

export type StatementRepresentation =
  | { kind: "binary"; subjectConceptId: string; relation: string; objectConceptId: string }
  | { kind: "complex"; participants: { conceptId: string; role: string }[] };

export interface Statement {
  id: string;
  topicId: string;
  representation: StatementRepresentation;
  /** One complete claim, including essential participants, polarity and conditions. */
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
  /** Ingestion warnings retained verbatim; original segments remain in ImportedSource. */
  sourceWarnings?: SourceWarning[];
  analysisWarnings?: AnalysisWarning[];
}

export interface AnalysisWarning {
  code: "AMBIGUOUS_EVIDENCE" | "QUESTIONS_PRESENT" | "EXTRACTION_REVIEW" | "UNUSED_CONCEPT" | "COVERAGE_LIMIT";
  message: string;
  blockId?: string;
  statementId?: string;
  conceptId?: string;
}

export interface StatementRef {
  graphId: string;
  statementId: string;
}

export interface ComparisonItem {
  id: string;
  /** Exactly one comparison per selected source statement, binary or complex. */
  referenceRelationshipId: string;
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
  topicId?: string;
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
