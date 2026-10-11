import type { EvaluationResult, EvaluationStatus, SourceAnalysis, Statement } from "@/backend/contracts/domain";

export type ReviewStatus = Exclude<EvaluationStatus, "correct">;

export interface ReviewCard {
  id: string;
  status: ReviewStatus;
  topic: string;
  cue: string;
  prompt: string;
  sourceAssertion: string;
  learnerAssertions: string[];
  explanation: string;
  suggestions: string[];
}

const priority: Record<ReviewStatus, number> = { contradicted: 0, partial: 1, missing: 2, uncertain: 3 };
function joinConcepts(names: string[]) {
  if (names.length < 2) return names[0] ?? "this concept";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function statementPrompt(statement: Statement, analysis: SourceAnalysis) {
  const conceptName = (id: string) => analysis.graph.concepts.find(concept => concept.id === id)?.name ?? "Unknown concept";
  if (statement.representation.kind === "binary") {
    return `What is the relationship between ${conceptName(statement.representation.subjectConceptId)} and ${conceptName(statement.representation.objectConceptId)}?`;
  }
  const names = [...new Set(statement.representation.participants.map(participant => conceptName(participant.conceptId)))];
  return `How are ${joinConcepts(names)} related?`;
}

export function buildReviewCards(analysis: SourceAnalysis, evaluation: EvaluationResult): ReviewCard[] {
  return evaluation.comparisons.flatMap(comparison => {
    if (comparison.status === "correct") return [];
    const sourceStatement = analysis.graph.statements.find(statement => statement.id === comparison.referenceRelationshipId);
    if (!sourceStatement) return [];
    const learnerAssertions = comparison.learnerStatements.flatMap(reference => {
      const statement = evaluation.learnerGraph.statements.find(candidate => candidate.id === reference.statementId);
      return statement ? [statement.assertion] : [];
    });
    return [{
      id: comparison.id,
      status: comparison.status,
      topic: analysis.graph.topics.find(topic => topic.id === comparison.topicId)?.title ?? "Source topic",
      cue: "Review this relationship",
      prompt: statementPrompt(sourceStatement, analysis),
      sourceAssertion: sourceStatement.assertion,
      learnerAssertions,
      explanation: comparison.explanation,
      suggestions: comparison.suggestions,
    }];
  }).sort((a, b) => priority[a.status] - priority[b.status]);
}
