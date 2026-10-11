/** Synthetic drafts only. These examples do not establish live extraction quality. */
import { readFileSync } from "node:fs";
import { qualityDraft } from "./extraction-quality-fixture.mjs";
export const representationSource = readFileSync(new URL("./fixtures/representation-quality-source.txt", import.meta.url), "utf8").trimEnd();

export function representationDraft(source) {
  const draft = qualityDraft(source);
  const evidenceFor = quote => [{ blockId: source.document.blocks.find(b => b.text.includes(quote)).id, quote }];
  const capture = draft.statements.find(s => s.id === "capture");
  const actors = [["plants", "agent"], ["algae", "agent"], ["bacteria", "agent"]];
  const quote = "The process is carried out by plants, algae, and some types of bacteria, which capture energy from sunlight to produce oxygen (O2) and chemical energy stored in glucose (a sugar).";
  const captures = [
    { ...capture, id: "capture", assertion: "Plants, algae, and some types of bacteria capture energy from sunlight to produce oxygen.",
      representation: { kind: "complex", participants: [...actors, ["sunlight", "input"], ["oxygen", "output"]].map(([conceptId, role]) => ({ conceptId, role })) }, evidence: evidenceFor(quote) },
    { ...capture, id: "capture-energy", assertion: "Plants, algae, and some types of bacteria capture energy from sunlight to produce chemical energy stored in glucose.",
      representation: { kind: "complex", participants: [...actors, ["sunlight", "input"], ["energy", "output"], ["glucose", "storage carrier"]].map(([conceptId, role]) => ({ conceptId, role })) }, evidence: evidenceFor(quote) },
  ];
  draft.statements.splice(draft.statements.indexOf(capture), 1, ...captures);
  const joint = draft.statements.find(s => s.id === "inputs");
  for (const [id, name] of [["water", "Water"], ["co2", "Carbon dioxide"]]) draft.statements.push({
    id: `intake-${id}`, topicId: joint.topicId,
    representation: { kind: "binary", subjectConceptId: "plants", relation: "take in", objectConceptId: id },
    assertion: `Plants take in ${name.toLowerCase()} during photosynthesis.`,
    negated: false, conditions: ["During photosynthesis"], role: "fact", evidence: structuredClone(joint.evidence),
  });
  // The joint location assertion remains intact; neither projection claims a pairing.
  draft.lessonSections = draft.topics.map(t => {
    const selected = draft.statements.filter(s => s.topicId === t.id);
    return { topicId: t.id, summary: selected.map(s => s.assertion).join(" "), statementIds: selected.map(s => s.id),
      keyPoints: selected.map(s => ({ text: s.assertion, statementIds: [s.id] })) };
  });
  return draft;
}

export const nonBiologySource = "Teams, volunteers, and some contractors jointly move cargo using trucks. Sensor does not transmit signals when disabled. Pump supplies water and coolant when enabled.";
export function nonBiologyDraft(source) {
  const concepts = [["teams", "Teams"], ["volunteers", "Volunteers"], ["contractors", "Contractors"], ["cargo", "Cargo"], ["trucks", "Trucks"],
    ["sensor", "Sensor"], ["signals", "Signals"], ["pump", "Pump"], ["water", "Water"], ["coolant", "Coolant"]].map(([id, name]) => ({ id, name, aliases: [] }));
  const statement = (id, assertion, representation, conditions, negated = false, quote = assertion) => ({ id, topicId: "t", representation, assertion, conditions, negated, role: "fact",
    evidence: [{ blockId: source.document.blocks.find(b => b.text.includes(quote)).id, quote }] });
  const statements = [
    statement("joint", "Teams, volunteers, and some contractors jointly move cargo using trucks.", { kind: "complex", participants:
      [["teams", "agent"], ["volunteers", "agent"], ["contractors", "agent"], ["cargo", "moved object"], ["trucks", "means"]].map(([conceptId, role]) => ({ conceptId, role })) }, ["Some contractors", "Joint action using trucks"]),
    statement("negative", "Sensor does not transmit signals when disabled.", { kind: "binary", subjectConceptId: "sensor", relation: "transmit", objectConceptId: "signals" }, ["When disabled"], true),
    ...[["water", "water"], ["coolant", "coolant"]].map(([id, name]) => statement(`supplies-${id}`, `Pump supplies ${name} when enabled.`,
      { kind: "binary", subjectConceptId: "pump", relation: "supplies", objectConceptId: id }, ["When enabled"], false, "Pump supplies water and coolant when enabled.")),
  ];
  return { concepts, statements, topics: [{ id: "t", title: "Synthetic logistics and controls" }],
    blockDispositions: source.document.blocks.map(b => ({ blockId: b.id, kind: "knowledge" })),
    lessonSections: [{ topicId: "t", summary: statements.map(s => s.assertion).join(" "), statementIds: statements.map(s => s.id),
      keyPoints: statements.map(s => ({ text: s.assertion, statementIds: [s.id] })) }] };
}
