/** Synthetic endpoint fixture, not an AI extraction or a reproduction of the old screenshot. */
export const endpointSource = "Photosynthesis produces glucose and oxygen. Glucose stores chemical energy. Chlorophyll absorbs light energy.";

export const expectedEndpoints = [
  ["Photosynthesis", "produces", "Glucose"],
  ["Photosynthesis", "produces", "Oxygen"],
  ["Glucose", "stores", "Chemical energy"],
  ["Chlorophyll", "absorbs", "Light energy"],
];

export function endpointDraft(source) {
  const topicId = "reference";
  // IDs are opaque. The process/energy names intentionally differ from their IDs.
  const concepts = [
    { id: "energy", name: "Photosynthesis", aliases: [] },
    { id: "product", name: "Glucose", aliases: [] },
    { id: "oxygen", name: "Oxygen", aliases: [] },
    { id: "process", name: "Chemical energy", aliases: ["Stored energy", "Energy"] },
    { id: "pigment", name: "Chlorophyll", aliases: [] },
    { id: "light", name: "Light energy", aliases: [] },
    { id: "energy-copy", name: "Chemical energy", aliases: ["Energy", "Stored energy"] },
  ].map(c => ({ ...c, topicId }));
  const rows = [
    ["energy", "produces", "product", "Photosynthesis produces glucose.", "Photosynthesis produces glucose and oxygen."],
    ["energy", "produces", "oxygen", "Photosynthesis produces oxygen.", "Photosynthesis produces glucose and oxygen."],
    ["product", "stores", "energy-copy", "Glucose stores chemical energy.", "Glucose stores chemical energy."],
    ["pigment", "absorbs", "light", "Chlorophyll absorbs light energy.", "Chlorophyll absorbs light energy."],
  ];
  const statements = rows.map(([subjectConceptId, relation, objectConceptId, assertion, quote], i) => ({
    id: `s${i}`, topicId, subjectConceptId, relation, objectConceptId, assertion,
    negated: false, conditions: [], role: "fact", evidence: [{ blockId: source.document.blocks[0].id, quote }],
  }));
  return {
    blockDispositions: source.document.blocks.map(b => ({ blockId: b.id, kind: "knowledge" })),
    topics: [{ id: topicId, title: "Source relations" }], concepts, statements,
    lessonSections: [{ topicId, summary: endpointSource, statementIds: statements.map(s => s.id),
      keyPoints: statements.map(s => ({ text: s.assertion, statementIds: [s.id] })) }],
  };
}
