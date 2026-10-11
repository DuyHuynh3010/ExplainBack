/** Hand-authored provider output for transport/UI regression, NOT AI success. */
import { readFileSync } from "node:fs";
export const topicSource = readFileSync(new URL("./fixtures/multisection-source.txt", import.meta.url), "utf8").trimEnd();
export function partDraft(request) {
  const { section, sourceData } = JSON.parse(request.prompt);
  const concepts = [], statements = [], blockDispositions = [];
  const concept = name => {
    const local = concepts.find(c => c.name === name);
    if (local) return local.id;
    const known = section.canonicalConcepts.find(c => c.name === name);
    const c = known ?? { id: `c${concepts.length + 1}`, name, aliases: [] };
    if (!concepts.some(x => x.id === c.id)) concepts.push(c);
    return c.id;
  };
  for (const b of sourceData.blocks) {
    const topic = section.topics.find(t => t.blockIds.includes(b.id));
    const picks = [
      [/Most life on Earth depends on photosynthesis\./, "Life on Earth", "depends on", "Photosynthesis", "Most life on Earth depends on photosynthesis.", ["Most life on Earth"]],
      [/the water is oxidized, meaning it loses electrons/, "Water", "loses", "Electrons", "Water loses electrons within the plant cell.", ["Within the plant cell", "During photosynthesis"]],
      [/chlorophyll absorbs energy from blue- and red-light waves/, "Chlorophyll", "absorbs", "Energy", "Chlorophyll absorbs energy from blue- and red-light waves.", ["From blue- and red-light waves"]],
      [/The light-dependent reaction takes place within the thylakoid membrane/, "Light-dependent reaction", "takes place within", "Thylakoid membrane", "The light-dependent reaction takes place within the thylakoid membrane.", []],
      [/C3 photosynthesis is used by the majority of plants\./, "C3 photosynthesis", "is used by", "Plants", "C3 photosynthesis is used by the majority of plants.", ["The majority of plants"]],
      [/Sensor transmits signals\./, "Sensor", "transmits", "Signals", "Sensor transmits signals.", []],
    ];
    const chosen = picks.find(([pattern]) => pattern.test(b.text));
    blockDispositions.push({ blockId: b.id, kind: chosen ? "knowledge" : "other" });
    if (!chosen) continue;
    const [pattern, subject, relation, object, assertion, conditions] = chosen;
    statements.push({ id: `s${statements.length + 1}`, topicId: topic.id,
      representation: { kind: "binary", subjectConceptId: concept(subject), relation, objectConceptId: concept(object) },
      assertion, conditions, negated: false, role: "fact", evidence: [{ blockId: b.id, quote: pattern.exec(b.text)[0] }] });
    // Explicitly exercise document-wide concept reuse in a second topic.
    if (b.text.includes("During photosynthesis, plants take in carbon dioxide (CO2) and water (H2O) from the air and soil.")) statements.push({ id: `s${statements.length + 1}`, topicId: topic.id,
      representation: { kind: "complex", participants: [{ conceptId: concept("Plants"), role: "agent" }, { conceptId: concept("Photosynthesis"), role: "context" }, { conceptId: concept("Water"), role: "input" }] },
      assertion: "Plants take in water during photosynthesis.", conditions: ["During photosynthesis"], negated: false, role: "fact",
      evidence: [{ blockId: b.id, quote: "During photosynthesis, plants take in carbon dioxide (CO2) and water (H2O) from the air and soil." }] });
  }
  return { topics: section.topics.map(t => ({ id: t.id, title: t.title })), concepts, statements, blockDispositions,
    lessonSections: section.topics.map(t => {
      const chosen = statements.filter(s => s.topicId === t.id);
      return { topicId: t.id, summary: chosen.map(s => s.assertion).join(" "), statementIds: chosen.map(s => s.id), keyPoints: chosen.map(s => ({ text: s.assertion, statementIds: [s.id] })) };
    }) };
}
