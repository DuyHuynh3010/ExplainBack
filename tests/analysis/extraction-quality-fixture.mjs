/** Synthetic outputs authored for regression, NOT successful AI extraction.
 * The source text is the unchanged two-paragraph user testcase. */
import { readFileSync } from "node:fs";
export const qualitySource = readFileSync(new URL("./fixtures/extraction-quality-source.txt", import.meta.url), "utf8").trimEnd();
export function qualityDraft(source, firstParagraphOnly = false) {
  const concepts = [
    ["life", "Life on Earth"], ["process", "Photosynthesis"], ["plants", "Plants"], ["algae", "Algae"], ["bacteria", "Bacteria"],
    ["sunlight", "Sunlight"], ["oxygen", "Oxygen"], ["energy", "Chemical energy"], ["glucose", "Glucose"],
    ["herbivores", "Herbivores"], ["carnivores", "Carnivores"],
    ...(!firstParagraphOnly ? [["co2", "Carbon dioxide"], ["water", "Water"], ["air", "Air"], ["soil", "Soil"], ["cell", "Plant cell"], ["electrons", "Electrons"], ["oxidation", "Oxidation"], ["reduction", "Reduction"]] : []),
  ].map(([id, name]) => ({ id, name, aliases: [] }));
  const statements = [];
  const locate = quote => {
    const block = source.document.blocks.find(b => b.text.includes(quote));
    if (!block) throw new Error(`Synthetic fixture quote is absent: ${quote}`);
    return [{ blockId: block.id, quote }];
  };
  const binary = (id, topicId, subjectConceptId, relation, objectConceptId, assertion, quote, conditions = [], role = "fact") => statements.push({
    id, topicId, representation: { kind: "binary", subjectConceptId, relation, objectConceptId }, assertion, conditions, negated: false, role, evidence: locate(quote),
  });
  const complex = (id, topicId, participants, assertion, quote, conditions = []) => statements.push({
    id, topicId, representation: { kind: "complex", participants: participants.map(([conceptId, role]) => ({ conceptId, role })) }, assertion, conditions, negated: false, role: "mechanism", evidence: locate(quote),
  });
  binary("depend", "overview", "life", "depends on", "process", "Most life on Earth depends on photosynthesis.", "Most life on Earth depends on photosynthesis.", ["Most life on Earth"]);
  const actors = "The process is carried out by plants, algae, and some types of bacteria,";
  for (const [id, name] of [["plants", "Plants"], ["algae", "Algae"], ["bacteria", "Some types of bacteria"]]) binary(`actor-${id}`, "overview", id, "carry out", "process", `${name} carry out photosynthesis.`, actors, id === "bacteria" ? ["Some types of bacteria"] : []);
  const capture = "which capture energy from sunlight to produce oxygen (O2) and chemical energy stored in glucose (a sugar).";
  complex("capture", "overview", [["plants", "agent"], ["algae", "agent"], ["bacteria", "agent"], ["sunlight", "energy source"], ["oxygen", "output"], ["energy", "stored output"], ["glucose", "storage carrier"]],
    "Plants, algae, and some types of bacteria capture energy from sunlight to produce oxygen and chemical energy stored in glucose.", capture, ["Some types of bacteria"]);
  binary("storage", "overview", "glucose", "stores", "energy", "Glucose stores chemical energy.", "chemical energy stored in glucose (a sugar).");
  complex("herbivore", "overview", [["herbivores", "recipient"], ["energy", "energy"], ["plants", "food source"]], "Herbivores obtain chemical energy by eating plants.", "Herbivores then obtain this energy by eating plants,");
  complex("carnivore", "overview", [["carnivores", "recipient"], ["energy", "energy"], ["herbivores", "food source"]], "Carnivores obtain chemical energy by eating herbivores.", "carnivores obtain it by eating herbivores.");
  if (!firstParagraphOnly) {
    complex("inputs", "conversion", [["plants", "agent"], ["process", "process"], ["co2", "input"], ["water", "input"], ["air", "joint source location"], ["soil", "joint source location"]],
      "During photosynthesis, plants take in carbon dioxide and water from the air and soil.", "During photosynthesis, plants take in carbon dioxide (CO2) and water (H2O) from the air and soil.", ["During photosynthesis", "The source does not specify individual input/location pairings."]);
    const cell = ["Within the plant cell", "During photosynthesis"];
    binary("oxidized", "conversion", "water", "undergoes", "oxidation", "Water undergoes oxidation within the plant cell.", "the water is oxidized, meaning it loses electrons", cell, "definition");
    binary("loses", "conversion", "water", "loses", "electrons", "Water loses electrons within the plant cell.", "the water is oxidized, meaning it loses electrons", cell, "definition");
    binary("reduced", "conversion", "co2", "undergoes", "reduction", "Carbon dioxide undergoes reduction within the plant cell.", "the carbon dioxide is reduced, meaning it gains electrons.", cell, "definition");
    binary("gains", "conversion", "co2", "gains", "electrons", "Carbon dioxide gains electrons within the plant cell.", "the carbon dioxide is reduced, meaning it gains electrons.", cell, "definition");
    const conversion = "This transforms the water into oxygen and the carbon dioxide into glucose.";
    binary("water-product", "conversion", "water", "transforms into", "oxygen", "Water transforms into oxygen.", conversion, ["During photosynthesis"]);
    binary("co2-product", "conversion", "co2", "transforms into", "glucose", "Carbon dioxide transforms into glucose.", conversion, ["During photosynthesis"]);
    binary("release", "conversion", "plants", "releases", "oxygen", "Plants release oxygen into the air.", "The plant then releases the oxygen back into the air,", ["Into the air"]);
  }
  const topics = [{ id: "overview", title: "Energy capture and food transfer" }, ...(!firstParagraphOnly ? [{ id: "conversion", title: "Inputs and conversions" }] : [])];
  return { blockDispositions: source.document.blocks.map(b => ({ blockId: b.id, kind: "knowledge" })), topics, concepts, statements,
    lessonSections: topics.map(t => {
      const selected = statements.filter(s => s.topicId === t.id);
      return { topicId: t.id, summary: selected.map(s => s.assertion).join(" "), statementIds: selected.map(s => s.id), keyPoints: selected.map(s => ({ text: s.assertion, statementIds: [s.id] })) };
    }),
  };
}
