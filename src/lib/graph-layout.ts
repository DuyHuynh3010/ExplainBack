import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge } from "elkjs";
import type { ReferenceNode, ReferenceEdge } from "./reference-graph";

const elk = new ELK();
/** Measured node boxes and measured wrapped labels drive one deterministic layout. */
export async function layoutReferenceGraph(nodes: ReferenceNode[], edges: ReferenceEdge[], labels: Map<string, { width: number; height: number }> = new Map(), direction: "RIGHT" | "DOWN" = "RIGHT") {
  const graph: ElkNode = {
    id: "root", layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL", "elk.randomSeed": "1", "elk.spacing.nodeNode": direction === "DOWN" ? "24" : "65",
      "elk.layered.spacing.nodeNodeBetweenLayers": "110", "elk.spacing.edgeNode": "28",
      "elk.spacing.edgeEdge": "20", "elk.spacing.labelNode": "20", "elk.separateConnectedComponents": "true",
      "elk.layered.mergeEdges": "false", "elk.layered.edgeLabels.sideSelection": "ALWAYS_UP",
      "elk.padding": "[top=45,left=45,bottom=45,right=45]" },
    children: nodes.map(n => ({ id: n.id, width: n.measured?.width ?? Number(n.style?.width ?? 220),
      height: n.measured?.height ?? 100, layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
      ports: edges.flatMap(e => [
        ...(e.source === n.id ? [{ id: e.sourceHandle!, width: 1, height: 1, layoutOptions: { "elk.port.side": direction === "DOWN" ? "SOUTH" : "EAST" } }] : []),
        ...(e.target === n.id ? [{ id: e.targetHandle!, width: 1, height: 1, layoutOptions: { "elk.port.side": direction === "DOWN" ? "NORTH" : "WEST" } }] : []),
      ]) })),
    edges: edges.map(e => {
      const box = labels.get(e.id) ?? { width: 180, height: 54 };
      return { id: e.id, sources: [e.sourceHandle!], targets: [e.targetHandle!],
        labels: [{ id: `label:${e.id}`, text: String(e.label ?? ""), ...box,
          layoutOptions: { "elk.edgeLabels.placement": "CENTER" } }] };
    }),
  };
  const result = await elk.layout(graph);
  const placed = new Map(result.children!.map(n => [n.id, n]));
  const routed = new Map((result.edges as ElkExtendedEdge[]).map(e => [e.id, e]));
  return {
    nodes: nodes.map(n => {
      const p = placed.get(n.id)!;
      return { ...n, position: { x: p.x!, y: p.y! }, data: { ...n.data,
        ports: p.ports!.map(port => ({ id: port.id, kind: port.id.endsWith(":source") ? "source" as const : "target" as const, x: port.x!, y: port.y! })) } };
    }),
    edges: edges.map(e => {
      const p = routed.get(e.id)!, section = p.sections?.[0], label = p.labels?.[0];
      if (!section) throw new Error("Layout did not produce a route for every relationship.");
      return { ...e, data: { ...e.data!, points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
        ...(label ? { labelPosition: { x: label.x! + label.width! / 2, y: label.y! + label.height! / 2 }, labelWidth: label.width } : {}) } };
    }),
  };
}
