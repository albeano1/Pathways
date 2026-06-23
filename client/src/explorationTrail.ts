import type { GraphEdge, GraphNode } from "../../shared/types";
import { formatSolveTime } from "./components/formatSolveTime";

export type NodeArrivals = ReadonlyMap<string, number>;
export type EdgeArrivals = ReadonlyMap<string, number>;

function edgeKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

function formatHopDuration(ms: number): string {
  const seconds = Math.max(0, ms / 1000);
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  return formatSolveTime(ms);
}

function hopDurationMs(
  fromId: string,
  toId: string,
  edgeArrivals: EdgeArrivals,
  nodeArrivals: NodeArrivals,
  puzzleStartedAt: number | null
): number | null {
  const edgeTime = edgeArrivals.get(edgeKey(fromId, toId));
  if (edgeTime === undefined) return null;
  const parentTime = nodeArrivals.get(fromId) ?? puzzleStartedAt;
  if (parentTime === undefined || parentTime === null) return null;
  return Math.max(0, edgeTime - parentTime);
}

function buildChildrenMap(edges: GraphEdge[]): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.rejected) continue;
    const list = children.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    children.set(edge.fromNodeId, list);
  }
  return children;
}

function winPathNodeIds(nodes: GraphNode[], winPath: string[]): string[] {
  const ids: string[] = [];
  for (const word of winPath) {
    const node = nodes.find((entry) => entry.word === word);
    if (!node) return [];
    ids.push(node.id);
  }
  return ids;
}

function sortChildren(
  childIds: string[],
  winChildId: string | undefined,
  nodeById: Map<string, GraphNode>
): string[] {
  return [...childIds].sort((left, right) => {
    if (winChildId) {
      if (left === winChildId) return -1;
      if (right === winChildId) return 1;
    }
    const leftCreated = nodeById.get(left)?.createdAt ?? 0;
    const rightCreated = nodeById.get(right)?.createdAt ?? 0;
    return leftCreated - rightCreated;
  });
}

function nodeEmoji(onWinPath: boolean, onOptimalLength: boolean): string {
  if (!onWinPath) return "🟨";
  return onOptimalLength ? "🟩" : "🟨";
}

function encodeFrom(
  nodeId: string,
  parentId: string | null,
  childrenByParent: Map<string, string[]>,
  nodeById: Map<string, GraphNode>,
  winPathIds: string[],
  optimalPathNodes: number,
  hopDurationsMs: number[],
  edgeArrivals: EdgeArrivals,
  nodeArrivals: NodeArrivals,
  puzzleStartedAt: number | null
): string[] {
  const winIndex = winPathIds.indexOf(nodeId);
  const onWinPath = winIndex >= 0;
  const parts: string[] = [nodeEmoji(onWinPath, onWinPath && winIndex < optimalPathNodes)];

  if (parentId) {
    if (onWinPath && winIndex > 0) {
      parts.push(formatHopDuration(hopDurationsMs[winIndex - 1] ?? 0));
    } else {
      const hop = hopDurationMs(parentId, nodeId, edgeArrivals, nodeArrivals, puzzleStartedAt);
      if (hop !== null) {
        parts.push(formatHopDuration(hop));
      }
    }
  }

  const children = childrenByParent.get(nodeId) ?? [];
  const winChildId = onWinPath ? winPathIds[winIndex + 1] : undefined;
  const sorted = sortChildren(children, winChildId, nodeById);

  for (const childId of sorted) {
    if (childId === winChildId) continue;
    const branch = encodeFrom(
      childId,
      nodeId,
      childrenByParent,
      nodeById,
      winPathIds,
      optimalPathNodes,
      hopDurationsMs,
      edgeArrivals,
      nodeArrivals,
      puzzleStartedAt
    );
    if (branch.length > 0) {
      parts.push(`(${branch.join(" ")})`);
    }
  }

  if (winChildId) {
    parts.push(
      ...encodeFrom(
        winChildId,
        nodeId,
        childrenByParent,
        nodeById,
        winPathIds,
        optimalPathNodes,
        hopDurationsMs,
        edgeArrivals,
        nodeArrivals,
        puzzleStartedAt
      )
    );
  }

  return parts;
}

/** Spoiler-free share line with winning path and side branches in parentheses. */
export function buildExplorationTrailLine(options: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  startWord: string;
  winPath: string[];
  optimalHops: number;
  hopDurationsMs: number[];
  nodeArrivals: NodeArrivals;
  edgeArrivals: EdgeArrivals;
  puzzleStartedAt: number | null;
}): string {
  const {
    nodes,
    edges,
    startWord,
    winPath,
    optimalHops,
    hopDurationsMs,
    nodeArrivals,
    edgeArrivals,
    puzzleStartedAt,
  } = options;

  const startNode = nodes.find((node) => node.word === startWord);
  if (!startNode || winPath.length === 0) {
    return buildFallbackTrail(winPath.length, optimalHops, hopDurationsMs);
  }

  const winPathIds = winPathNodeIds(nodes, winPath);
  if (winPathIds.length === 0 || winPathIds[0] !== startNode.id) {
    return buildFallbackTrail(winPath.length, optimalHops, hopDurationsMs);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = buildChildrenMap(edges);
  const optimalPathNodes = optimalHops + 1;

  return encodeFrom(
    startNode.id,
    null,
    childrenByParent,
    nodeById,
    winPathIds,
    optimalPathNodes,
    hopDurationsMs,
    edgeArrivals,
    nodeArrivals,
    puzzleStartedAt
  ).join(" ");
}

function buildFallbackTrail(
  pathLength: number,
  optimalHops: number,
  hopDurationsMs: number[]
): string {
  const parts: string[] = [];
  for (let index = 0; index < pathLength; index++) {
    parts.push(index <= optimalHops ? "🟩" : "🟨");
    if (index < hopDurationsMs.length) {
      parts.push(formatHopDuration(hopDurationsMs[index]!));
    }
  }
  return parts.join(" ");
}
