/** Hand-authored semantic expectations, not proof of model accuracy. */
export const sourceText = "Plants use sunlight to carry out photosynthesis. During photosynthesis, plants use carbon dioxide and water to produce glucose and oxygen. Water is oxidized, meaning it loses electrons. Carbon dioxide is reduced, meaning it gains electrons. Glucose stores chemical energy. Plants release oxygen into the air.";
export const explanations = {
  short: "Glucose stores chemical energy.",
  paraphrase: "Plants capture energy from sunlight to make sugar through photosynthesis. They consume water and carbon dioxide and produce glucose and oxygen. Water gives up electrons, while carbon dioxide gains them. The sugar stores chemical energy, and oxygen is released into the atmosphere.",
  missing: "Plants use sunlight for photosynthesis. This process produces glucose and oxygen.",
  contradiction: "During photosynthesis, water gains electrons and carbon dioxide loses electrons.",
  negation: "Photosynthesis does not produce oxygen.",
  mixed: "Glucose stores chemical energy. Plants use oxygen instead of carbon dioxide during photosynthesis.",
  additional: "Glucose stores chemical energy. Some plants also have medicinal uses.",
  // Expresses storage but omits the specific type of energy: incomplete, not absent.
  partial: "Glucose stores energy.",
};
export const rows = [
  ["Plants", "use", "Sunlight", "Plants use sunlight to carry out photosynthesis."],
  ["Photosynthesis", "uses", "Carbon dioxide", "During photosynthesis, plants use carbon dioxide and water to produce glucose and oxygen."],
  ["Photosynthesis", "uses", "Water", "During photosynthesis, plants use carbon dioxide and water to produce glucose and oxygen."],
  ["Photosynthesis", "produces", "Glucose", "During photosynthesis, plants use carbon dioxide and water to produce glucose and oxygen."],
  ["Photosynthesis", "produces", "Oxygen", "During photosynthesis, plants use carbon dioxide and water to produce glucose and oxygen."],
  ["Water", "loses", "Electrons", "Water is oxidized, meaning it loses electrons."],
  ["Carbon dioxide", "gains", "Electrons", "Carbon dioxide is reduced, meaning it gains electrons."],
  ["Glucose", "stores", "Chemical energy", "Glucose stores chemical energy."],
  ["Plants", "release", "Oxygen", "Plants release oxygen into the air."],
];
export function syntheticDraft(source) {
  const names = [...new Set(rows.flatMap(([a, , b]) => [a, b]))];
  const statements = rows.map(([subject, relation, object, quote], i) => ({
    id: `s${i}`, topicId: "t", subjectConceptId: `c${names.indexOf(subject)}`,
    objectConceptId: `c${names.indexOf(object)}`, relation, assertion: `${subject} ${relation} ${object}.`,
    negated: false, conditions: [], role: "fact", evidence: [{ blockId: source.document.blocks[0].id, quote }],
  }));
  return { blockDispositions: source.document.blocks.map(b => ({ blockId: b.id, kind: "knowledge" })),
    topics: [{ id: "t", title: "Photosynthesis" }],
    concepts: names.map((name, i) => ({ id: `c${i}`, topicId: "t", name, aliases: [] })), statements,
    lessonSections: [{ topicId: "t", summary: sourceText, statementIds: statements.map(s => s.id),
      keyPoints: statements.map(s => ({ text: s.assertion, statementIds: [s.id] })) }],
  };
}
