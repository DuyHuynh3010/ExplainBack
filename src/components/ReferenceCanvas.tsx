"use client";
import { useEffect, useRef, useState } from "react";
import { applyNodeChanges, Background, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow } from "@xyflow/react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { highlightedGraph, selectionNodeIds, type GraphSelection, type ReferenceNode, type ReferenceEdge } from "@/lib/reference-graph";
import { layoutReferenceGraph } from "@/lib/graph-layout";
import { KnowledgeNode } from "./KnowledgeNode";
import { ReferenceEdge as EdgeComponent } from "./ReferenceEdge";

const nodeTypes = { knowledge: KnowledgeNode };
const edgeTypes = { reference: EdgeComponent };
type Flow = { nodes: ReferenceNode[]; edges: ReferenceEdge[] };
interface Props { flow: Flow; topicId: string; selection: GraphSelection; onSelect: (selection: GraphSelection) => void; focusSelection?: boolean }

export function ReferenceCanvas(props: Props) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}
function Canvas({ flow, topicId, selection, onSelect, focusSelection = false }: Props) {
  const [placed, setPlaced] = useState(flow);
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const initialized = useNodesInitialized();
  const { getNodes, fitView, zoomIn, zoomOut } = useReactFlow<ReferenceNode, ReferenceEdge>();
  const focused = useRef("");
  useEffect(() => {
    if (!initialized) return;
    let cancelled = false, frame = 0;
    // The same DOM wrapping/font rules are used for measurement and visible labels.
    const labels = new Map<string, { width: number; height: number }>();
    for (const e of flow.edges) {
      const measure = document.createElement("span");
      measure.className = "reference-edge-label graph-label-measure";
      measure.textContent = String(e.label ?? "");
      if (e.data?.status) { const badge = document.createElement("span"); badge.className = `status-badge ${e.data.status}`; badge.textContent = e.data.status; measure.appendChild(badge); }
      document.body.appendChild(measure);
      labels.set(e.id, { width: Math.ceil(measure.offsetWidth) + 4, height: Math.ceil(measure.offsetHeight) + 2 });
      measure.remove();
    }
    layoutReferenceGraph(getNodes(), flow.edges, labels, matchMedia("(max-width:760px)").matches ? "DOWN" : "RIGHT").then(result => {
      if (cancelled) return;
      setPlaced(result); setReady(true);
      frame = requestAnimationFrame(() => void fitView({ padding: 0.18, minZoom: 0.85, maxZoom: 1 }));
    }).catch(() => { if (!cancelled) setError("Graph layout could not complete. Statements and evidence remain available below. Reopen this topic to retry."); });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [initialized, flow, getNodes, fitView]);
  useEffect(() => {
    if (!selection) { focused.current = ""; return; }
    if (!focusSelection || !ready || selection.kind !== "statement" || focused.current === selection.id) return;
    const ids = selectionNodeIds(placed, selection);
    if (!ids.size) return;
    focused.current = selection.id;
    // Focus the actual aligned pair, never the entire graph or an invented match.
    void fitView({ nodes: [...ids].map(id => ({ id })), padding: 0.16, minZoom: 0.65, maxZoom: 1.1, duration: 280 });
  }, [selection, ready, focusSelection, placed, fitView]);
  const display = highlightedGraph(placed, selection);
  return <>
    <div className="graph-tools" aria-label="Graph controls">
      <button className="button secondary" aria-label="Zoom in" onClick={() => void zoomIn()}><ZoomIn size={17} /></button>
      <button className="button secondary" aria-label="Zoom out" onClick={() => void zoomOut()}><ZoomOut size={17} /></button>
      <button className="button secondary" onClick={() => void fitView({ padding: 0.18, minZoom: 0.15, maxZoom: 1 })}><Maximize size={16} />Fit graph</button>
      <button className="button secondary" disabled={!selection} onClick={() => onSelect(null)}>Clear selection</button>
    </div>
    {error && <p role="alert" className="request-message error-message">{error}</p>}
    <div className={`graph reference-graph ${ready ? "layout-ready" : "layout-pending"}`} aria-label="Source concept map" data-topic-id={topicId} data-layout-ready={ready}>
      {!ready && !error && <p className="graph-loading" role="status">Arranging relationships…</p>}
      <ReactFlow nodes={display.nodes} edges={display.edges.map(e => ({ ...e, data: { ...e.data!, onSelect: () => onSelect({ kind: "statement", id: e.data!.selectionId ?? e.data!.referenceStatementId }) } }))} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={changes => setPlaced(previous => ({ ...previous, nodes: applyNodeChanges(changes, previous.nodes) }))}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.15} maxZoom={2.5}
        onPaneClick={() => onSelect(null)} onNodeClick={(_, n) => onSelect(n.data.kind === "relation" ? { kind: "statement", id: n.data.selectionId ?? n.data.referenceStatementId! } : { kind: "node", id: n.id })}
        onEdgeClick={(_, e) => onSelect({ kind: "statement", id: e.data!.selectionId ?? e.data!.referenceStatementId })}
        preventScrolling zoomOnScroll zoomOnPinch panOnScroll={false} panOnDrag zoomActivationKeyCode={null}
        zoomOnDoubleClick={false}><Background gap={22} color="#dfe5e3" /></ReactFlow>
    </div>
  </>;
}
