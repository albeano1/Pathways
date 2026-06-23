import type {
  ConfirmedBranch,
  ConfirmedEdge,
  GraphEdge,
  GraphNode,
  RejectedBranch,
  StepConnection,
} from "../../../shared/types";
import { ancestorWordsForKey, buildPathFromEdges, branchAnchorKey } from "./pathUtils";

let nodeCounter = 0;
let edgeCounter = 0;

export function syncGraphCounters(nodes: GraphNode[], edges: GraphEdge[]): void {
  let maxNode = 0;
  let maxEdge = 0;
  for (const node of nodes) {
    const match = node.id.match(/^n(\d+)$/);
    if (match) maxNode = Math.max(maxNode, Number(match[1]));
  }
  for (const edge of edges) {
    const match = edge.id.match(/^e(\d+)$/);
    if (match) maxEdge = Math.max(maxEdge, Number(match[1]));
  }
  nodeCounter = maxNode;
  edgeCounter = maxEdge;
}

export function nextNodeId(): string {
  nodeCounter += 1;
  return `n${nodeCounter}`;
}

export function nextEdgeId(): string {
  edgeCounter += 1;
  return `e${edgeCounter}`;
}

export function createStartNode(start: string, hopsToEnd: number): GraphNode {
  return {
    id: nextNodeId(),
    word: start,
    hopsToEnd,
    createdAt: 0,
  };
}

/** Explore-path words plus node id for each entry (indices aligned with server path). */
export function buildExploreFromGraph(
  nodes: GraphNode[]
): { path: string[]; keys: string[] } {
  const sorted = [...nodes].sort((a, b) => a.createdAt - b.createdAt);
  const path: string[] = [];
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const node of sorted) {
    if (!seen.has(node.word)) {
      path.push(node.word);
      keys.push(node.id);
      seen.add(node.word);
    }
  }

  return { path, keys };
}

export function nodeByWord(nodes: GraphNode[], word: string): GraphNode | undefined {
  return nodes.find((node) => node.word === word);
}

export interface GraphIndex {
  nodeById: Map<string, GraphNode>;
  nodeIdByWord: Map<string, string>;
  confirmedEdgeKeys: Set<string>;
  childrenByParent: Map<string, string[]>;
  parentsByChild: Map<string, string[]>;
  explorePath: string[];
  exploreKeys: string[];
}

export function buildGraphIndex(nodes: GraphNode[], edges: GraphEdge[]): GraphIndex {
  const nodeById = new Map<string, GraphNode>();
  const nodeIdByWord = new Map<string, string>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
    if (!nodeIdByWord.has(node.word)) {
      nodeIdByWord.set(node.word, node.id);
    }
  }

  const confirmedEdgeKeys = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const parentsByChild = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.rejected) continue;
    confirmedEdgeKeys.add(`${edge.fromNodeId}|${edge.toNodeId}`);
    const children = childrenByParent.get(edge.fromNodeId) ?? [];
    children.push(edge.toNodeId);
    childrenByParent.set(edge.fromNodeId, children);
    const parents = parentsByChild.get(edge.toNodeId) ?? [];
    parents.push(edge.fromNodeId);
    parentsByChild.set(edge.toNodeId, parents);
  }

  const explore = buildExploreFromGraph(nodes);
  return {
    nodeById,
    nodeIdByWord,
    confirmedEdgeKeys,
    childrenByParent,
    parentsByChild,
    explorePath: explore.path,
    exploreKeys: explore.keys,
  };
}

export function nodeByWordInIndex(index: GraphIndex, word: string): GraphNode | undefined {
  const id = index.nodeIdByWord.get(word);
  return id ? index.nodeById.get(id) : undefined;
}

export function hasGraphEdgeInIndex(
  index: GraphIndex,
  fromNodeId: string,
  toNodeId: string
): boolean {
  return index.confirmedEdgeKeys.has(`${fromNodeId}|${toNodeId}`);
}

export function hasGraphEdge(
  edges: GraphEdge[],
  fromNodeId: string,
  toNodeId: string
): boolean {
  return edges.some(
    (edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId && !edge.rejected
  );
}

export function resolveParentNodeId(
  connection: StepConnection,
  exploreKeys: string[]
): string | undefined {
  return exploreKeys[connection.connectFromIndex];
}

/** Shortest confirmed path from start word to end word through the graph. */
export function shortestWinPath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startWord: string,
  endWord: string
): string[] | null {
  const startNode = nodeByWord(nodes, startWord);
  const endNode = nodeByWord(nodes, endWord);
  if (!startNode || !endNode) return null;

  const confirmed = edges.filter((edge) => !edge.rejected);
  const adjacency = new Map<string, string[]>();
  for (const edge of confirmed) {
    const next = adjacency.get(edge.fromNodeId) ?? [];
    next.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, next);
  }

  const queue: Array<{ nodeId: string; path: string[] }> = [
    { nodeId: startNode.id, path: [startNode.id] },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    if (current.nodeId === endNode.id) {
      return current.path.map((id) => nodes.find((node) => node.id === id)!.word);
    }

    for (const nextId of adjacency.get(current.nodeId) ?? []) {
      if (!visited.has(nextId)) {
        queue.push({ nodeId: nextId, path: [...current.path, nextId] });
      }
    }
  }

  return null;
}

export function closestHopsInGraph(nodes: GraphNode[]): number | undefined {
  let min: number | undefined;
  for (const node of nodes) {
    if (min === undefined || node.hopsToEnd < min) min = node.hopsToEnd;
  }
  return min;
}

function getOrCreateNode(
  nodes: GraphNode[],
  wordToId: Map<string, string>,
  word: string,
  hopsToEnd: number,
  createdAt: number
): string {
  const existing = wordToId.get(word);
  if (existing) return existing;
  const id = nextNodeId();
  nodes.push({ id, word, hopsToEnd, createdAt });
  wordToId.set(word, id);
  return id;
}

function addGraphEdge(
  edges: GraphEdge[],
  fromNodeId: string,
  toNodeId: string,
  data: Pick<GraphEdge, "relation" | "proximity" | "hopsToEnd" | "rejected">
): void {
  if (
    edges.some(
      (edge) =>
        edge.fromNodeId === fromNodeId &&
        edge.toNodeId === toNodeId &&
        Boolean(edge.rejected) === Boolean(data.rejected)
    )
  ) {
    return;
  }
  edges.push({
    id: nextEdgeId(),
    fromNodeId,
    toNodeId,
    relation: data.relation,
    proximity: data.proximity,
    hopsToEnd: data.hopsToEnd,
    rejected: data.rejected,
  });
}

/** Convert legacy trunk/branch state into an equivalent graph. */
export function migrateTreeToGraph(
  start: string,
  initialHops: number,
  trunkEdges: ConfirmedEdge[],
  branches: ConfirmedBranch[],
  rejected: RejectedBranch[] = []
): { nodes: GraphNode[]; edges: GraphEdge[]; currentNodeId?: string } {
  nodeCounter = 0;
  edgeCounter = 0;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const wordToId = new Map<string, string>();
  let createdAt = 0;

  const trunkPath = buildPathFromEdges(start, trunkEdges);
  const startHops = trunkEdges.length > 0 ? trunkEdges[0]!.hopsToEnd + 1 : initialHops;
  getOrCreateNode(nodes, wordToId, start, startHops, createdAt++);

  for (let index = 0; index < trunkEdges.length; index++) {
    const edge = trunkEdges[index]!;
    const fromWord = trunkPath[index]!;
    const fromId = wordToId.get(fromWord)!;
    const toId = getOrCreateNode(nodes, wordToId, edge.to, edge.hopsToEnd, createdAt++);
    addGraphEdge(edges, fromId, toId, edge);
  }

  for (const branch of branches) {
    const anchorKey = branchAnchorKey(branch);
    const anchorWords = ancestorWordsForKey(start, trunkEdges, branches, anchorKey);
    const fromWord = anchorWords[anchorWords.length - 1] ?? branch.from;
    const fromId = wordToId.get(fromWord);
    if (!fromId) continue;

    const rootId = getOrCreateNode(
      nodes,
      wordToId,
      branch.to,
      branch.hopsToEnd ?? 0,
      createdAt++
    );
    addGraphEdge(edges, fromId, rootId, {
      relation: branch.relation,
      proximity: branch.proximity,
      hopsToEnd: branch.hopsToEnd ?? 0,
    });

    let previousId = rootId;
    for (const continuation of branch.continuation) {
      const toId = getOrCreateNode(
        nodes,
        wordToId,
        continuation.to,
        continuation.hopsToEnd,
        createdAt++
      );
      addGraphEdge(edges, previousId, toId, continuation);
      previousId = toId;
    }
  }

  for (const reject of rejected) {
    const fromId = wordToId.get(reject.from);
    if (!fromId) continue;
    const rejectId = getOrCreateNode(nodes, wordToId, reject.attempted, initialHops + 1, createdAt++);
    addGraphEdge(edges, fromId, rejectId, {
      relation: "RelatedTo",
      hopsToEnd: initialHops + 1,
      rejected: true,
    });
  }

  syncGraphCounters(nodes, edges);
  const lastNode = [...nodes].sort((a, b) => b.createdAt - a.createdAt)[0];
  return { nodes, edges, currentNodeId: lastNode?.id };
}
