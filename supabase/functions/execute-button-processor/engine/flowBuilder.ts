import type { FlowNode, FlowEdge } from "../types/index.ts";

export function buildExecutionOrder(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, FlowEdge[]>();

  for (const node of nodes) {
    incomingEdges.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of edges) {
    incomingEdges.get(edge.target_node_id)?.push(edge.source_node_id);
    outgoingEdges.get(edge.source_node_id)?.push(edge);
  }

  const connectedNodeIds = new Set<string>();
  for (const edge of edges) {
    connectedNodeIds.add(edge.source_node_id);
    connectedNodeIds.add(edge.target_node_id);
  }

  const startNodes = nodes.filter(n =>
    (incomingEdges.get(n.id) || []).length === 0 && connectedNodeIds.has(n.id)
  );

  const executionOrder: FlowNode[] = [];
  const visited = new Set<string>();

  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node) {
      executionOrder.push(node);
    }

    const outEdges = outgoingEdges.get(nodeId) || [];
    for (const edge of outEdges) {
      traverse(edge.target_node_id);
    }
  }

  for (const startNode of startNodes) {
    traverse(startNode.id);
  }

  return executionOrder;
}
