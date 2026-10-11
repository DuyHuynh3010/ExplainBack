/** Synthetic v2 architecture fixture. Never presented as a real model result. */
export const globalSource = "Photosynthesis produces glucose and oxygen.\n\nGlucose stores chemical energy. Plants use water and carbon dioxide together to produce glucose.";
export function globalDraft(source) {
  const concepts = ["Photosynthesis", "Glucose", "Oxygen", "Chemical energy", "Plants", "Water", "Carbon dioxide"]
    .map((name, i) => ({ id: `c${i}`, name, aliases: [] }));
  const binary = (id, topicId, subject, object, relation, assertion, block, quote) => ({
    id, topicId, representation: { kind: "binary", subjectConceptId: `c${subject}`, objectConceptId: `c${object}`, relation },
    assertion, negated: false, conditions: [], role: "fact", evidence: [{ blockId: source.document.blocks[block].id, quote }],
  });
  const statements = [
    binary("glucose", "early", 0, 1, "produces", "Photosynthesis produces glucose.", 0, source.document.blocks[0].text),
    binary("oxygen", "early", 0, 2, "produces", "Photosynthesis produces oxygen.", 0, source.document.blocks[0].text),
    binary("stores", "late", 1, 3, "stores", "Glucose stores chemical energy.", 1, "Glucose stores chemical energy."),
    { id: "joint", topicId: "late", representation: { kind: "complex", participants: [
      { conceptId: "c4", role: "agent" }, { conceptId: "c5", role: "input" },
      { conceptId: "c6", role: "input" }, { conceptId: "c1", role: "output" },
    ] }, assertion: "Plants use water and carbon dioxide together to produce glucose.", negated: false,
    conditions: ["Water and carbon dioxide act jointly"], role: "mechanism", evidence: [{ blockId: source.document.blocks[1].id, quote: "Plants use water and carbon dioxide together to produce glucose." }] },
  ];
  const topics = [{ id: "late", title: "Energy and inputs" }, { id: "early", title: "Products" }];
  return { topics, concepts, statements,
    blockDispositions: source.document.blocks.map(b => ({ blockId: b.id, kind: "knowledge" })),
    lessonSections: topics.map(t => { const selected = statements.filter(s => s.topicId === t.id); return {
      topicId: t.id, summary: selected.map(s => s.assertion).join(" "), statementIds: selected.map(s => s.id),
      keyPoints: selected.map(s => ({ text: s.assertion, statementIds: [s.id] })),
    }; }),
  };
}
