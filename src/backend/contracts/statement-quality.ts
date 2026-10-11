import type { Statement, Concept } from "./domain";

export interface QualityIssue {
  path: string; code: "invariant"; message: string;
  severity: "error" | "review"; ids: Record<string, string>; ruleId: string;
}
const fold = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
const article = (text: string) => text.replace(/^(?:the|an?)\s+/i, "");
const begins = (text: string, name: string) => text === name || text.startsWith(`${name} `) || text.startsWith(`${name},`) || text.startsWith(`${name}.`) || text.startsWith(`${name};`);
const names = (c: Pick<Concept, "name" | "aliases">) => [...new Set([c.name, c.name.replace(/\s*\([^)]*\)/g, ""), ...c.aliases].map(n => article(fold(n))))].filter(Boolean).sort((a, b) => b.length - a.length);
const negativeRelation = /\b(?:not|never|cannot|can't|doesn't|don't|isn't|aren't|không)\b/i;

/** Conservative literal checks, NOT an entailment model. Unknown paraphrase/coreference
 * remains a review diagnostic. Never rewrites endpoints, assertion or polarity. */
export function inspectStatement(
  statement: Pick<Statement, "id" | "representation" | "assertion" | "negated" | "conditions">,
  concepts: Pick<Concept, "id" | "name" | "aliases">[], path: string,
): QualityIssue[] {
  const r = statement.representation, issues: QualityIssue[] = [];
  const ruleId = (field: string) => field === ".representation.objectConceptId" ? "literal_object_mismatch" : field === ".negated" ? "polarity_scope_mismatch" : field === ".representation.relation" ? "negative_relation" : field === ".representation" ? "incomplete_binary_projection" : "representation_review";
  const add = (field: string, message: string, severity: QualityIssue["severity"] = "error") => issues.push({ path: `${path}${field}`, code: "invariant", message, severity, ruleId: ruleId(field), ids: { statementId: statement.id } });
  if (r.kind === "complex") return issues;
  if (negativeRelation.test(r.relation)) add(".representation.relation", "Relation must be affirmative; reconcile the relation, negated flag and assertion. Do not strip negation without preserving meaning.");
  if (r.subjectConceptId === r.objectConceptId) add(".representation", "Review self-loop against the assertion; reflexive relations are allowed but a missing object must not be replaced by the subject.", "review");
  const subject = concepts.find(c => c.id === r.subjectConceptId), object = concepts.find(c => c.id === r.objectConceptId);
  if (!subject || !object) return issues; // Reference validation supplies precise IDs.
  const assertion = article(fold(statement.assertion));
  const subjectName = names(subject).find(n => begins(assertion, n));
  if (!subjectName) {
    add(".assertion", "Subject alignment needs review: aliases, coreference or a different clause order may explain it.", "review");
    return issues;
  }
  let rest = assertion.slice(subjectName.length).trim();
  // These qualifiers do not deny the unqualified predicate. Keep their scope;
  // do not read "not necessarily a tree" as "is not a tree".
  const modal = /^(?:(?:is|are|was|were|does|do|can|will)\s+)?not (?:necessarily|sure (?:whether|if))\b/.test(rest);
  if (modal && !/^(?:necessarily\b|(?:is |am |are )?sure\b)/.test(fold(r.relation))) {
    if (statement.negated) add(".negated", "Modal uncertainty does not negate the unqualified represented predicate; retain its scope in assertion/conditions or a complex claim.");
    add(".assertion", "Modal scope needs review; this assertion does not establish the predicate or its opposite.", "review");
    return issues;
  }
  const negation = /^(?:(?:does|do|did|is|are|was|were|can|could|will|would|has|have) not\s+|never\s+|cannot\s+|not\s+)/;
  const isNegative = negation.test(rest);
  if (isNegative) rest = rest.replace(negation, "");
  const relation = fold(r.relation), [verb, ...tail] = relation.split(" ");
  const variants = [...new Set([verb, `${verb}s`, `${verb}es`, verb.replace(/s$/, "")])].map(v => [v, ...tail].join(" ")).sort((a, b) => b.length - a.length);
  const candidates = [rest, rest.replace(/^(?:is|are|was|were)\s+/, "")];
  let objectText: string | undefined;
  for (const candidate of candidates) {
    const predicate = variants.find(v => begins(candidate, v));
    if (predicate) { objectText = article(candidate.slice(predicate.length).trim()); break; }
  }
  if (objectText === undefined) {
    add(".assertion", "Predicate alignment needs review; the binary projection has not been semantically verified.", "review");
  } else {
    let target = names(object).find(n => begins(objectText!, n));
    let expectedPolarity: boolean | undefined = isNegative;
    // Negative determiner at the actual object head: "has no cycles" denies
    // has(Cycles). Only apply when the positive object matches after "no".
    // If the object itself is "No cycles" or "Graph with no cycles", the
    // absence is internal to that concept, not a denial of the outer relation.
    if (!target && /^no\s+/.test(objectText)) {
      const positiveObject = objectText.replace(/^no\s+/, "");
      const absenceTarget = names(object).find(n => begins(positiveObject, n));
      if (absenceTarget) {
        objectText = positiveObject; target = absenceTarget;
        expectedPolarity = isNegative ? undefined : true;
        if (isNegative) add(".negated", "Nested predicate/determiner negation needs scope review; no polarity rewrite is inferred.", "review");
      }
    }
    if (expectedPolarity !== undefined && expectedPolarity !== statement.negated) add(".negated", "Literal assertion polarity disagrees with the negated flag.");
    // An explicit reflexive assertion can legitimately have a self-loop.
    const coreference = /^(?:it|them|itself|themselves|each other|one another|this|that|these|those|process\b|compound\b)[ .,!;]/.test(`${objectText} `);
    if (!target && !coreference) {
      const differentHead = concepts.some(c => c.id !== object.id && names(c).some(n => begins(objectText!, n)));
      const comma = objectText.indexOf(",");
      const displacedTarget = comma >= 0 && names(object).some(n => objectText!.slice(comma + 1).includes(n));
      // A different canonical head, a target displaced into a trailing clause, or
      // a non-reflexive self-loop is a concrete projection conflict. Other lexical
      // mismatches may be paraphrase; surface them for review, never rewrite them.
      add(".representation.objectConceptId", "Object alignment differs from the literal subject/predicate frame. Check the actual head, aliases and trailing clauses; preserve complex meaning rather than redirecting endpoints.",
        differentHead || displacedTarget || r.subjectConceptId === r.objectConceptId ? "error" : "review");
    }
    if (target) {
      const remainder = objectText.slice(target.length).trim();
      const whileIndex = remainder.search(/\bwhile\b/);
      const clause = whileIndex < 0 ? "" : remainder.slice(whileIndex).replace(/[.!;]+$/, "").trim();
      // A literal trailing context retained in conditions is not an omitted clause.
      // This is not entailment: keep a review finding and do not rewrite the claim.
      // Conjoined objects and production clauses remain subject to the hard guard.
      const retainedContext = !!clause && statement.conditions.some(c => fold(c).replace(/[.!;]+$/, "").trim() === clause);
      const unmatched = retainedContext ? remainder.slice(0, whileIndex) : remainder;
      if (/^(?:and|or)\s+/.test(remainder) || /\b(?:to produce|to make|which (?:produces|splits))\b/.test(remainder) || /\bwhile\b/.test(unmatched)) {
        add(".representation", "The binary projection omits an explicit additional participant or clause. Split only independent claims, otherwise preserve a complex statement.");
      }
      if (retainedContext) add(".conditions", "Trailing while clause is retained as context; review its scope against the complete assertion.", "review");
    }
  }
  if (/^(?:is|are|has|relates to|associated with)$/.test(relation)) add(".representation.relation", "Generic relation needs review; inspect the complete assertion and participants.", "review");
  return issues;
}

/** Detect an explicit unsplit conjunction copied onto separate projections.
 * Different paraphrases/inverse relations are not assumed to be equivalent. */
export function inspectRepeatedAssertions(
  statements: Pick<Statement, "id" | "representation" | "assertion">[],
  concepts: Pick<Concept, "id" | "name" | "aliases">[], path: string,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const [i, s] of statements.entries()) {
    const r = s.representation, assertion = fold(s.assertion);
    if (r.kind !== "binary" || !/\band\b/.test(assertion)) continue;
    const mentions = (id: string) => {
      const c = concepts.find(c => c.id === id);
      return !!c && names(c).some(n => (` ${assertion} `).includes(n));
    };
    const conflict = statements.some(other => {
      const t = other.representation;
      if (other.id === s.id || t.kind !== "binary" || fold(other.assertion) !== assertion || fold(t.relation) !== fold(r.relation)) return false;
      return (t.objectConceptId === r.objectConceptId && t.subjectConceptId !== r.subjectConceptId && mentions(t.subjectConceptId) && mentions(r.subjectConceptId)) ||
        (t.subjectConceptId === r.subjectConceptId && t.objectConceptId !== r.objectConceptId && mentions(t.objectConceptId) && mentions(r.objectConceptId));
    });
    if (conflict) issues.push({ path: `${path}[${i}].assertion`, code: "invariant", ruleId: "repeated_conjunctive_assertion", severity: "error", ids: { statementId: s.id },
      message: "An explicit conjunctive assertion was copied onto different partial binary projections. Give each independently supported projection its own complete assertion, or preserve one complex statement with all essential participants." });
  }
  return issues;
}
