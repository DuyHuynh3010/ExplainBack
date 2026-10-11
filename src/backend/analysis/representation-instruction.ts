/** Shared extraction semantics; source and learner retain separate provenance/tasks. */
export const REPRESENTATION_INSTRUCTION = `Create concepts for the actual entities, values,
properties and expressions of the INPUT claim, not only broad categories already in a catalog.
Canonical concept identity is document-wide; topics and claim order do not define identity.
For binary, subject + affirmative relation + object + polarity/conditions must express the
complete assertion. Never replace a missing object, property, input or output with the subject.
For example, "A valve has a pressure rating" needs Valve -> has -> Pressure rating,
not Valve -> has -> Valve. "A machine assigns one output to each input" requires the
machine, input and output with their roles/scope in a complex claim, not Machine -> assigns -> Machine.
"A switch is either on or off" needs the two actual states and their alternative roles,
not Switch -> is -> Switch. Definitions are not inherently reflexive.
Reflexive claims may have self-loops only when the assertion actually expresses reflexivity.
Split independent predicates/objects into standalone atomic assertions with shared exact
evidence if supported. Otherwise preserve a complex claim with every essential participant
and its actual role. Do not choose the first two participants of a complex assertion.
An asserted false truth value is affirmative: use the actual False value, not negated
membership of the category Truth value. NOT within an expression does not negate the
whole equivalence. Negated describes denial of the represented predicate, not correctness.
For an equivalence, use complete expressions as operands, not generic connective categories.
A formula supplements a faithful representation; it cannot fix incompatible endpoints.
Preserve formulas, quantifier order, every, exactly, only, even if, and all relevant conditions.
Use complex for quantified dependencies or formulas when binary loses their essential scope.
"I think X" expresses X with an epistemic qualifier; do not omit or correct X.
"I am not sure whether X" does not assert X or NOT X. Preserve the uncertainty as a modal
claim with its full assertion/conditions and negated=false; do not invent a truth verdict.
Preserve incorrect claims exactly as input claims. Quotes are verbatim input substrings;
never rewrite a quote, supply invented offsets, or use another document as its evidence.`;
