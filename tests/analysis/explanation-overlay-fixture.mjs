/** Hand-authored, test-only semantic candidates. Never used by production APIs. */
export const lessonText = `Photosynthesis

Plants use energy from sunlight to produce glucose. Glucose stores chemical energy. Photosynthesis also produces oxygen.

Food chains

Herbivores obtain energy by eating plants. Carnivores obtain energy by eating herbivores.

Chlorophyll

Chlorophyll is a pigment found in chloroplasts. It absorbs blue and red light and reflects green light.`;
export const explanationText = `Chlorophyll absorbs blue and red light. It also absorbs green light instead of reflecting it.

Plants use sunlight to make glucose. Glucose stores energy.

Herbivores obtain energy by eating plants. Carnivores might obtain energy from herbivores, but I am not sure whether they do so by eating them.`;
const definitions = [
  ["photo", "Plants use energy from sunlight to produce glucose.", [["Plants", "agent"], ["Sunlight", "input"], ["Glucose", "output"]]],
  ["photo", "Glucose stores chemical energy.", ["Glucose", "stores", "Chemical energy"]],
  ["photo", "Photosynthesis produces oxygen.", ["Photosynthesis", "produces", "Oxygen"], "Photosynthesis also produces oxygen."],
  ["food", "Herbivores obtain energy by eating plants.", [["Herbivores", "agent"], ["Plants", "input"], ["Energy", "output"]]],
  ["food", "Carnivores obtain energy by eating herbivores.", [["Carnivores", "agent"], ["Herbivores", "input"], ["Energy", "output"]]],
  ["light", "Chlorophyll is a pigment.", ["Chlorophyll", "is", "Pigment"], "Chlorophyll is a pigment found in chloroplasts."],
  ["light", "Chlorophyll is found in chloroplasts.", ["Chlorophyll", "found in", "Chloroplasts"], "Chlorophyll is a pigment found in chloroplasts."],
  ["light", "Chlorophyll absorbs blue light.", ["Chlorophyll", "absorbs", "Blue light"], "It absorbs blue and red light and reflects green light."],
  ["light", "Chlorophyll absorbs red light.", ["Chlorophyll", "absorbs", "Red light"], "It absorbs blue and red light and reflects green light."],
  ["light", "Chlorophyll reflects green light.", ["Chlorophyll", "reflects", "Green light"], "It absorbs blue and red light and reflects green light."],
];
function builder() {
  const concepts = [];
  const concept = name => { let c = concepts.find(c => c.name === name); if (!c) { c = { id: `c${concepts.length}`, name, aliases: [] }; concepts.push(c); } return c.id; };
  const representation = rep => Array.isArray(rep[0]) ? { kind: "complex", participants: rep.map(([name, role]) => ({ conceptId: concept(name), role })) }
    : { kind: "binary", subjectConceptId: concept(rep[0]), relation: rep[1], objectConceptId: concept(rep[2]) };
  return { concepts, concept, representation };
}
export function lessonDraft(source) {
  const b = builder();
  const statements = definitions.map(([topicId, assertion, rep, quote = assertion], i) => ({ id: `s${i}`, topicId, assertion, representation: b.representation(rep), negated: false, conditions: [], role: "fact", evidence: [{ blockId: source.document.blocks.find(b => b.text.includes(quote)).id, quote }] }));
  const topics = [{ id: "photo", title: "Photosynthesis" }, { id: "food", title: "Food chains" }, { id: "light", title: "Chlorophyll" }];
  return { topics, concepts: b.concepts, statements,
    blockDispositions: source.document.blocks.map(b => ({ blockId: b.id, kind: statements.some(s => s.evidence.some(e => e.blockId === b.id)) ? "knowledge" : "other" })),
    lessonSections: topics.map(t => { const ss = statements.filter(s => s.topicId === t.id); return { topicId: t.id, summary: ss.map(s => s.assertion).join(" "), statementIds: ss.map(s => s.id), keyPoints: ss.map(s => ({ text: s.assertion, statementIds: [s.id] })) }; }) };
}
export function evaluationDraft(source, additional = false) {
  const b = builder();
  const claims = [
    ["Chlorophyll absorbs blue light.", ["Chlorophyll", "absorbs", "Blue light"], "Chlorophyll absorbs blue and red light."],
    ["Chlorophyll absorbs red light.", ["Chlorophyll", "absorbs", "Red light"], "Chlorophyll absorbs blue and red light."],
    ["Chlorophyll absorbs green light instead of reflecting it.", ["Chlorophyll", "absorbs", "Green light"], "It also absorbs green light instead of reflecting it.", ["instead of reflecting it"]],
    ["Plants use sunlight to make glucose.", [["Plants", "agent"], ["Sunlight", "input"], ["Glucose", "output"]]],
    ["Glucose stores energy.", ["Glucose", "stores", "Energy"]],
    ["Herbivores obtain energy by eating plants.", [["Herbivores", "agent"], ["Plants", "input"], ["Energy", "output"]]],
    ["Carnivores might obtain energy from herbivores, but I am not sure whether they do so by eating them.", [["Carnivores", "agent"], ["Herbivores", "input"], ["Energy", "output"]], undefined, ["might", "not sure whether by eating them"]],
    ...(additional ? [["Some plants have medicinal uses.", ["Plants", "have", "Medicinal uses"]]] : []),
  ].map(([assertion, rep, quote = assertion, conditions = []], i) => ({ id: `l${i}`, assertion, representation: b.representation(rep), quote, conditions, negated: false }));
  const verdicts = [["correct", ["l3"]], ["partial", ["l4"]], ["missing", []], ["correct", ["l5"]], ["uncertain", ["l6"]], ["missing", []], ["missing", []], ["correct", ["l0"]], ["correct", ["l1"]], ["contradicted", ["l2"]]];
  const comparisons = source.graph.statements.map((s, i) => ({ referenceRelationshipId: s.id, status: verdicts[i][0], learnerClaimIds: verdicts[i][1], explanation: `Test-only ${verdicts[i][0]} candidate, not an AI verdict.`, suggestions: [] }));
  const conceptAlignments = b.concepts.flatMap(c => {
    const ref = source.graph.concepts.find(r => r.name === c.name);
    return ref ? [{ learnerConceptId: c.id, referenceConceptId: ref.id, status: "matched", explanation: "Test-only contextual identity in aligned claims." }] : [];
  });
  return { concepts: b.concepts, claims, comparisons, conceptAlignments, additionalIdeas: additional ? [{ learnerClaimIds: ["l7"], explanation: "Medicinal uses are not covered by this lesson, not automatically wrong." }] : [] };
}
