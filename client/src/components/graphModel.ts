import type { GraphEdge, GraphNode, Proximity, RejectedBranch } from "../../../shared/types";
import type { PathNodeVariant } from "./PathNode";
import { nodeByWord } from "../api/graphUtils";

export interface RenderGraphNode {
  id: string;
  word: string;
  variant: PathNodeVariant;
  hopsToEnd: number;
  createdAt: number;
}

export interface RenderGraphEdge {
  id: string;
  fromId: string;
  toId: string;
  relation?: string;
  rejected?: boolean;
  proximity?: Proximity;
  hopsToEnd?: number;
}

export function buildRenderGraph(input: {
  start: string;
  end: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  rejected: RejectedBranch[];
  currentNodeId: string;
  complete?: boolean;
  includeRejected?: boolean;
}): { nodes: RenderGraphNode[]; edges: RenderGraphEdge[] } {
  const { start, end, nodes, edges, rejected, currentNodeId, complete, includeRejected = true } =
    input;
  const won = complete === true || nodes.some((node) => node.word === end);

  const renderNodes: RenderGraphNode[] = nodes.map((node) => {
    let variant: PathNodeVariant = "confirmed";
    if (node.word === start) variant = "start";
    else if (won && node.word === end) variant = "win-tip";
    else if (node.id === currentNodeId && !won) variant = "current";

    return {
      id: node.id,
      word: node.word,
      variant,
      hopsToEnd: node.hopsToEnd,
      createdAt: node.createdAt,
    };
  });

  const renderEdges: RenderGraphEdge[] = edges.map((edge) => ({
    id: edge.id,
    fromId: edge.fromNodeId,
    toId: edge.toNodeId,
    relation: edge.relation,
    rejected: edge.rejected,
    proximity: edge.proximity,
    hopsToEnd: edge.hopsToEnd,
  }));

  for (const attempt of includeRejected ? rejected : []) {
    const parent = nodeByWord(nodes, attempt.from);
    if (!parent) continue;
    const rejectNodeId = `reject:${attempt.id}`;
    renderNodes.push({
      id: rejectNodeId,
      word: attempt.attempted,
      variant: "rejected",
      hopsToEnd: Math.max(0, parent.hopsToEnd - 1),
      createdAt: Number.MAX_SAFE_INTEGER,
    });
    renderEdges.push({
      id: `reject-edge:${attempt.id}`,
      fromId: parent.id,
      toId: rejectNodeId,
      rejected: true,
    });
  }

  return { nodes: renderNodes, edges: renderEdges };
}
