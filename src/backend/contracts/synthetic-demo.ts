import type {
  Concept, Evidence, ExplainBackDemo, SourceAnalysis, Statement, StatementRef,
} from "./domain";
import type { AnalyzeTextRequest, AnalyzeSourceResponse, EvaluateTextRequest, EvaluateTextResponse } from "./api";

/** Hand-authored synthetic demo data. No PDF extraction, AI or evaluation was run. */
const sourceText = [
  "Chlorophyll absorbs light energy.",
  "Plants use carbon dioxide and water to produce glucose through photosynthesis.",
  "Photosynthesis releases oxygen.",
  "Glucose stores chemical energy.",
  "Light energy powers photosynthesis.",
].join(" ");
const learnerText = [
  "Chlorophyll absorbs light energy.",
  "Plants use carbon dioxide to produce glucose through photosynthesis.",
  "Photosynthesis does not release oxygen.",
  "Light energy may affect photosynthesis somehow.",
  "Plant cells contain chloroplasts.",
].join(" ");

const concept = (id: string, name: string, aliases: string[] = [], symbol?: string): Concept => ({
  id, topicId: "photosynthesis", name, aliases, ...(symbol ? { symbol } : {}),
});
const concepts: Concept[] = [
  concept("chlorophyll", "Chlorophyll"), concept("light", "Light energy", ["sunlight"]),
  concept("process", "Photosynthesis"), concept("glucose", "Glucose", [], "C6H12O6"),
  concept("oxygen", "Oxygen", [], "O2"), concept("energy", "Chemical energy"),
];

function evidence(id: string, documentId: string, text: string, quote: string, kind: Evidence["kind"]): Evidence {
  const start = text.indexOf(quote);
  if (start < 0) throw new Error("Synthetic fixture quote not found.");
  return {
    id, documentId, blockId: "body", quote, kind, verification: "verified",
    location: { charRange: { start, end: start + quote.length } },
  };
}

function statement(
  id: string, subjectConceptId: string, relation: string, objectConceptId: string,
  assertion: string, conditions: string[] = [], negated = false,
): Statement {
  return {
    id, topicId: "photosynthesis", subjectConceptId, relation, objectConceptId, assertion,
    negated, conditions, role: "mechanism", evidenceIds: [`e-${id}`],
  };
}

const sourceStatements: Statement[] = [
  statement("absorbs", "chlorophyll", "absorbs", "light", "Chlorophyll absorbs light energy."),
  statement("produces", "process", "produces", "glucose",
    "Plants use carbon dioxide and water to produce glucose through photosynthesis.",
    ["Carbon dioxide and water are available"]),
  statement("releases", "process", "releases", "oxygen", "Photosynthesis releases oxygen."),
  statement("stores", "glucose", "stores", "energy", "Glucose stores chemical energy."),
  statement("powers", "light", "powers", "process", "Light energy powers photosynthesis."),
];
const learnerStatements: Statement[] = [
  statement("absorbs", "chlorophyll", "absorbs", "light", "Chlorophyll absorbs light energy."),
  statement("produces", "process", "produces", "glucose",
    "Plants use carbon dioxide to produce glucose through photosynthesis.", ["Carbon dioxide is available"]),
  statement("releases", "process", "releases", "oxygen", "Photosynthesis does not release oxygen.", [], true),
  statement("powers", "light", "may affect", "process", "Light energy may affect photosynthesis somehow."),
  statement("extra", "cells", "contain", "chloroplasts", "Plant cells contain chloroplasts."),
];

const sourceAnalysis: SourceAnalysis = {
  schemaVersion: "1.0", id: "demo-analysis", provenance: "synthetic_demo",
  document: {
    id: "source-document", kind: "text", title: "Photosynthesis: synthetic contract demo",
    blocks: [{ id: "body", documentId: "source-document", text: sourceText }],
  },
  graph: {
    id: "source-graph", documentId: "source-document", kind: "source",
    topics: [{ id: "photosynthesis", title: "Photosynthesis" }], concepts,
    statements: sourceStatements,
    evidence: sourceStatements.map(s => evidence(`e-${s.id}`, "source-document", sourceText, s.assertion, "source_quote")),
  },
  lessonSections: [{
    id: "section-photosynthesis", topicId: "photosynthesis",
    summary: "Chlorophyll absorbs light energy, which powers photosynthesis. Using carbon dioxide and water, plants produce glucose and release oxygen. Glucose stores chemical energy.",
    statementIds: sourceStatements.map(s => s.id),
    keyPoints: sourceStatements.map(s => ({ id: `point-${s.id}`, text: s.assertion, statementIds: [s.id] })),
  }],
};
const sourceRef = (statementId: string): StatementRef => ({ graphId: "source-graph", statementId });
const learnerRef = (statementId: string): StatementRef => ({ graphId: "learner-graph", statementId });

export const syntheticDemo: ExplainBackDemo = {
  description: "Synthetic demo data, authored only to illustrate contract v1; not real document analysis or AI evaluation.",
  sourceAnalysis,
  learnerText,
  evaluation: {
    schemaVersion: "1.0", id: "demo-evaluation", provenance: "synthetic_demo",
    sourceAnalysisId: sourceAnalysis.id, topicIds: ["photosynthesis"],
    learnerDocument: {
      id: "learner-document", kind: "text",
      blocks: [{ id: "body", documentId: "learner-document", text: learnerText }],
    },
    learnerGraph: {
      id: "learner-graph", documentId: "learner-document", kind: "learner",
      topics: [{ id: "photosynthesis", title: "Photosynthesis", sourceTopicId: "photosynthesis" }],
      // Local IDs may repeat across graphs; comparison references always include graphId.
      concepts: concepts.filter(c => c.id !== "energy").map(c => ({ ...c, aliases: [...c.aliases] })).concat([
        concept("cells", "Plant cells"), concept("chloroplasts", "Chloroplasts"),
      ]),
      statements: learnerStatements,
      evidence: learnerStatements.map(s => evidence(`e-${s.id}`, "learner-document", learnerText, s.assertion, "learner_quote")),
    },
    comparisons: [
      {
        id: "compare-absorbs", topicId: "photosynthesis", sourceStatements: [sourceRef("absorbs")],
        learnerStatements: [learnerRef("absorbs")], status: "correct",
        explanation: "The learner states the same light absorption relationship as the source.", suggestions: [],
      },
      {
        id: "compare-produces", topicId: "photosynthesis", sourceStatements: [sourceRef("produces")],
        learnerStatements: [learnerRef("produces")], status: "partial",
        explanation: "Glucose production and carbon dioxide are included, but water is omitted.",
        suggestions: ["Include water among the inputs needed to produce glucose."],
      },
      {
        id: "compare-releases", topicId: "photosynthesis", sourceStatements: [sourceRef("releases")],
        learnerStatements: [learnerRef("releases")], status: "contradicted",
        explanation: "The learner explicitly negates the source's oxygen release assertion.",
        suggestions: ["State that photosynthesis releases oxygen."],
      },
      {
        id: "compare-stores", topicId: "photosynthesis", sourceStatements: [sourceRef("stores")],
        learnerStatements: [], status: "missing",
        explanation: "There is no learner assertion about glucose storing chemical energy.",
        suggestions: ["Explain the energy storage role of glucose."],
      },
      {
        id: "compare-powers", topicId: "photosynthesis", sourceStatements: [sourceRef("powers")],
        learnerStatements: [learnerRef("powers")], status: "uncertain",
        explanation: "'May affect ... somehow' is too vague to determine the learner's understanding of the energy relationship.",
        suggestions: ["Clarify how light energy powers photosynthesis."],
      },
    ],
    additionalIdeas: [{
      id: "additional-chloroplasts", topicId: "photosynthesis", learnerStatements: [learnerRef("extra")],
      explanation: "Plant cells containing chloroplasts is outside this supplied source. No correctness verdict is assigned.",
    }],
  },
};

/** Concrete stateless request examples for frontend/backend development. */
export const demoAnalyzeRequest: AnalyzeTextRequest = {
  schemaVersion: "1.0", source: { kind: "text", title: sourceAnalysis.document.title, text: sourceText },
};
export const demoEvaluateRequest: EvaluateTextRequest = {
  schemaVersion: "1.0", sourceAnalysis, topicIds: ["photosynthesis"], learner: { text: learnerText },
};
export const demoAnalyzeResponse: AnalyzeSourceResponse = { ok: true, schemaVersion: "1.0", data: sourceAnalysis };
export const demoEvaluateResponse: EvaluateTextResponse = { ok: true, schemaVersion: "1.0", data: syntheticDemo.evaluation };
