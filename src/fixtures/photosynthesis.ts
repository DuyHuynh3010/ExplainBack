import type { Node } from "@xyflow/react";
import type { Relationship, Status } from "@/types/lesson";

export const sampleTitle = "How photosynthesis works";
export const sampleSource = "Photosynthesis is the process plants use to make glucose. Chlorophyll absorbs light energy from the sun. This light energy powers photosynthesis. Plants use carbon dioxide and water to produce glucose. Glucose stores chemical energy that plants use for growth. Oxygen is released as a by-product of photosynthesis.";
export const sampleTranscript = "Chlorophyll absorbs light energy from the sun, and that energy powers photosynthesis. Plants use carbon dioxide to make glucose. Glucose helps plants grow. Photosynthesis uses up oxygen rather than releasing it.";
export const statuses: Status[] = ["correct", "partial", "missing", "contradicted"];
export const statusColors: Record<Status, string> = { correct: "#278466", partial: "#b47b18", missing: "#77828d", contradicted: "#cc5151" };
export const conceptNodes: Node[] = [
  { id: "chlorophyll", position: { x: 0, y: 0 }, data: { label: "Chlorophyll" }, sourcePosition: undefined },
  { id: "light", position: { x: 0, y: 130 }, data: { label: "Light energy" } },
  { id: "process", position: { x: 230, y: 130 }, data: { label: "Photosynthesis" } },
  { id: "inputs", position: { x: 230, y: 0 }, data: { label: "CO₂ + water" } },
  { id: "glucose", position: { x: 460, y: 0 }, data: { label: "Glucose" } },
  { id: "oxygen", position: { x: 460, y: 260 }, data: { label: "Oxygen" } },
];
export const relationships: Relationship[] = [
 { id: "absorbs", source: "chlorophyll", target: "light", label: "absorbs", expected: "Chlorophyll absorbs light energy.", status: "correct", statement: "Chlorophyll absorbs light energy from the sun", quote: "Chlorophyll absorbs light energy from the sun.", explanation: "The sample correctly connects chlorophyll with absorbing sunlight." },
 { id: "powers", source: "light", target: "process", label: "powers", expected: "Light energy powers photosynthesis.", status: "correct", statement: "that energy powers photosynthesis", quote: "This light energy powers photosynthesis.", explanation: "The sample correctly explains the role of light energy in the process." },
 { id: "produces", source: "inputs", target: "glucose", label: "produce", expected: "Carbon dioxide and water are used to produce glucose.", status: "partial", statement: "Plants use carbon dioxide to make glucose.", quote: "Plants use carbon dioxide and water to produce glucose.", explanation: "Carbon dioxide is included, but the role of water is left out." },
 { id: "stores", source: "process", target: "glucose", label: "makes energy-storing", expected: "Photosynthesis makes glucose, which stores chemical energy.", status: "missing", statement: null, quote: "Glucose stores chemical energy that plants use for growth.", explanation: "The sample mentions growth but does not explain that glucose stores chemical energy." },
 { id: "releases", source: "process", target: "oxygen", label: "releases", expected: "Photosynthesis releases oxygen as a by-product.", status: "contradicted", statement: "Photosynthesis uses up oxygen rather than releasing it.", quote: "Oxygen is released as a by-product of photosynthesis.", explanation: "The sample reverses the relationship: photosynthesis releases oxygen." },
];
