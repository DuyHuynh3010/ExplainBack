/** Synthetic visualization data; no extraction quality or real AI claim. */
export const visualClaims = [
  ["food", "Herbivores obtain energy by eating plants.", [["Herbivores", "agent"], ["Plants", "input"], ["Energy", "output"]]],
  ["food", "Carnivores obtain energy by eating herbivores.", [["Carnivores", "agent"], ["Herbivores", "input"], ["Energy", "output"]]],
  ["photo", "Plants use sunlight to produce glucose within a leaf cell.", [["Plants", "agent"], ["Sunlight", "input"], ["Glucose", "output"], ["Leaf cell", "location"]]],
  ["photo", "Glucose stores chemical energy.", ["Glucose", "stores", "Chemical energy"]],
  ["light", "Chlorophyll absorbs light energy under the stated light condition.", ["Chlorophyll", "absorbs", "Light energy"], ["Under the stated light condition; this intentionally long label tests wrapping and routed clearance"]],
  ["light", "Light energy reaches plants.", ["Light energy", "reaches", "Plants"]],
  ["light", "Plants contain chlorophyll.", ["Plants", "contain", "Chlorophyll"]],
  ["dense", "Controller activates pump.", ["Controller", "activates", "Pump"]],
  ["dense", "Controller monitors pump.", ["Controller", "monitors", "Pump"]],
  ["dense", "Pump reports to controller.", ["Pump", "reports to", "Controller"]],
  ["dense", "Pump moves water.", ["Pump", "moves", "Water"]],
  ["dense", "Water fills tank.", ["Water", "fills", "Tank"]],
  ["dense", "Tank supplies pump.", ["Tank", "supplies", "Pump"]],
  ["dense", "Sensor detects signals.", ["Sensor", "detects", "Signals"]],
  ["dense", "Volunteers and contractors jointly move cargo using trucks.", [["Volunteers", "agent"], ["Contractors", "agent"], ["Cargo", "output"], ["Trucks", "means"]]],
  ["dense", "Controller checks itself.", ["Controller", "checks", "Controller"]],
];
export const visualizationSource = visualClaims.map(c => c[1]).join("\n\n");
export function visualizationDraft(source) {
  const concepts = [];
  const concept = name => {
    let c = concepts.find(c => c.name === name);
    if (!c) { c = { id: `c${concepts.length}`, name, aliases: [] }; concepts.push(c); }
    return c.id;
  };
  const statements = visualClaims.map(([topicId, assertion, rep, conditions = []], i) => ({
    id: `s${i}`, topicId, assertion, conditions, negated: false, role: "fact",
    representation: Array.isArray(rep[0]) ? { kind: "complex", participants: rep.map(([name, role]) => ({ conceptId: concept(name), role })) }
      : { kind: "binary", subjectConceptId: concept(rep[0]), relation: rep[1], objectConceptId: concept(rep[2]) },
    evidence: [{ blockId: source.document.blocks[i].id, quote: assertion }],
  }));
  const topics = [{ id: "food", title: "Food chains" }, { id: "photo", title: "Photosynthesis" }, { id: "light", title: "Chlorophyll" }, { id: "dense", title: "Dense synthetic system" }];
  return { topics, concepts, statements, blockDispositions: source.document.blocks.map(b => ({ blockId: b.id, kind: "knowledge" })),
    lessonSections: topics.map(t => { const ss = statements.filter(s => s.topicId === t.id); return { topicId: t.id, summary: ss.map(s => s.assertion).join(" "), statementIds: ss.map(s => s.id), keyPoints: ss.map(s => ({ text: s.assertion, statementIds: [s.id] })) }; }) };
}
